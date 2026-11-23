import { beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_DATASETS } from '../../data/datasets';
import { SqliteEngine } from '../sqliteEngine';
import { executeAndTraceSql } from '../tracer';

describe('SQLFlow Step-by-Step Tracer & SQLite Verification', () => {
  let engine: SqliteEngine;

  beforeEach(async () => {
    engine = new SqliteEngine();
    await engine.loadDataset(SAMPLE_DATASETS[0]);
  });

  it('verifies every preset query across all 3 sample datasets identically against SQLite WASM', async () => {
    for (const dataset of SAMPLE_DATASETS) {
      await engine.loadDataset(dataset);
      const schema = engine.getSchema();
      expect(schema.length).toBeGreaterThanOrEqual(4);

      for (const preset of dataset.presets) {
        const res = executeAndTraceSql(engine, preset.sql);
        expect(res.ok, `Preset "${preset.id}" failed: ${res.error}`).toBe(true);
        expect(
          res.mode,
          `Preset "${preset.id}" fell back: ${res.fallbackReason}`
        ).toBe('select_traced');
        expect(res.steps.length).toBeGreaterThanOrEqual(2);
        expect(
          res.verifiedWithSqlite,
          `Preset "${preset.id}" mismatched SQLite output`
        ).toBe(true);
      }
    }
  });

  it('traces FROM -> JOIN -> WHERE -> GROUP BY -> HAVING -> SELECT -> ORDER BY -> LIMIT in exact logical order', () => {
    const preset = SAMPLE_DATASETS[0].presets[0];
    const res = executeAndTraceSql(engine, preset.sql);
    expect(res.ok).toBe(true);
    expect(res.steps.map((s) => s.clause)).toEqual([
      'FROM',
      'JOIN',
      'JOIN',
      'WHERE',
      'GROUP_BY',
      'HAVING',
      'SELECT',
      'ORDER_BY',
      'LIMIT',
    ]);
    // Written order starts with SELECT (writtenOrder 1) which executes at step 7
    expect(res.writtenOrder[0].clause).toBe('SELECT');
    expect(res.writtenOrder[0].writtenOrder).toBe(1);
    expect(res.writtenOrder[0].executionOrder).toBe(7);
  });

  it('captures WHERE row evaluations including filtered rows', () => {
    const res = executeAndTraceSql(
      engine,
      `SELECT full_name, gpa FROM students WHERE gpa >= 8.5;`
    );
    expect(res.ok).toBe(true);
    expect(res.verifiedWithSqlite).toBe(true);
    const whereStep = res.steps.find((s) => s.clause === 'WHERE');
    expect(whereStep).toBeDefined();
    expect(whereStep!.inputCount).toBe(8);
    expect(whereStep!.outputCount).toBe(3);
    const filteredRows = whereStep!.rows.filter((r) => r.status === 'filtered');
    expect(filteredRows.length).toBe(5);
    expect(filteredRows[0].evaluation?.result).toBe(false);
    expect(filteredRows[0].evaluation?.substituted).toContain('gpa(');
  });

  it('tracks LEFT JOIN unmatched rows with NULL padding and JoinPreview stats', () => {
    const res = executeAndTraceSql(
      engine,
      `SELECT s.full_name, e.score FROM students s LEFT JOIN enrollments e ON s.id = e.student_id;`
    );
    expect(res.ok).toBe(true);
    expect(res.verifiedWithSqlite).toBe(true);
    const joinStep = res.steps.find((s) => s.clause === 'JOIN');
    expect(joinStep?.joinPreview?.joinType).toBe('LEFT');
    expect(joinStep?.joinPreview?.leftOnlyCount).toBe(1); // Bùi Tuấn Kiệt has no enrollments
    const unmatched = joinStep?.rows.filter((r) => r.status === 'unmatched_null');
    expect(unmatched?.length).toBe(1);
  });

  it('handles ORDER BY referencing a column not included in SELECT', () => {
    const res = executeAndTraceSql(
      engine,
      `SELECT full_name FROM students ORDER BY gpa DESC LIMIT 3;`
    );
    expect(res.ok).toBe(true);
    expect(res.verifiedWithSqlite).toBe(true);
    const orderStep = res.steps.find((s) => s.clause === 'ORDER_BY');
    expect(orderStep?.rows[0].cells[orderStep.columns[0].id]).toBe('Lê Thu Hà');
  });

  it('traces CTE (WITH ...) and UNION queries cleanly', () => {
    const cteRes = executeAndTraceSql(
      engine,
      `WITH top_students AS (
         SELECT id, full_name, gpa FROM students WHERE gpa >= 8.5
       )
       SELECT full_name, gpa FROM top_students ORDER BY gpa DESC;`
    );
    expect(cteRes.ok).toBe(true);
    expect(cteRes.mode).toBe('select_traced');
    expect(cteRes.verifiedWithSqlite).toBe(true);
    expect(cteRes.steps[0].clause).toBe('CTE');

    const unionRes = executeAndTraceSql(
      engine,
      `SELECT full_name FROM students WHERE city = 'Hà Nội'
       UNION
       SELECT full_name FROM students WHERE gpa >= 9.0
       ORDER BY full_name ASC;`
    );
    expect(unionRes.ok).toBe(true);
    expect(unionRes.mode).toBe('select_traced');
    expect(unionRes.verifiedWithSqlite).toBe(true);
  });

  it('produces DML before/after diff for INSERT, UPDATE, and DELETE', () => {
    const ins = executeAndTraceSql(
      engine,
      `INSERT INTO departments (id, name, building) VALUES (5, 'An toàn Thông tin', 'Tòa D1');`
    );
    expect(ins.ok).toBe(true);
    expect(ins.mode).toBe('dml_diff');
    expect(ins.dmlDiff?.addedCount).toBe(1);

    const upd = executeAndTraceSql(
      engine,
      `UPDATE departments SET building = 'Tòa D2' WHERE id = 5;`
    );
    expect(upd.ok).toBe(true);
    expect(upd.dmlDiff?.updatedCount).toBe(1);

    const del = executeAndTraceSql(engine, `DELETE FROM departments WHERE id = 5;`);
    expect(del.ok).toBe(true);
    expect(del.dmlDiff?.deletedCount).toBe(1);
  });

  it('translates SQLite errors into friendly Vietnamese messages', () => {
    const res = executeAndTraceSql(engine, `SELECT nonexistent FROM students;`);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Không tìm thấy cột');
    expect(res.errorHint).toBeTruthy();
  });
});
