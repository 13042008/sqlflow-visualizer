# SQLFlow — Trực Quan Hóa Luồng Thực Thi SQL

Ứng dụng web tương tác giúp trực quan hóa từng bước thực thi câu lệnh SQL hoàn toàn trên trình duyệt bằng **SQLite WebAssembly (`sql.js`)**, **React**, **TypeScript**, **Tailwind CSS** và **Framer Motion**.

## Tính năng nổi bật

- **Luồng thực thi từng bước (Step-by-Step Pipeline)**: Minh họa trực quan thứ tự chạy logic `WITH (CTE)` → `FROM` → `JOIN` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `DISTINCT` → `SET OP` → `ORDER BY` → `LIMIT / OFFSET`.
- **Đánh dấu mệnh đề trực tiếp**: Trình soạn thảo CodeMirror 6 hỗ trợ tô màu cú pháp SQLite, gợi ý tên bảng/cột và tự động làm nổi bật đúng mệnh đề đang chạy.
- **Trực quan hóa chuyên sâu**:
  - `JOIN`: Biểu đồ Venn động, phân biệt nguồn cột theo màu, làm nổi bật giá trị `NULL` ở `LEFT / RIGHT / FULL JOIN` và so sánh 2 bảng nguồn.
  - `WHERE`: Đánh dấu dòng `GIỮ` / `LOẠI` kèm công thức thay thế giá trị cụ thể cho từng dòng.
  - `GROUP BY` & `HAVING`: Gom dòng thành thẻ nhóm kèm các hàm tổng hợp (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`).
  - `ORDER BY` & `LIMIT / OFFSET`: Animation dịch chuyển hàng kèm thứ hạng (`#cũ → #mới`) và đường cắt `OFFSET` / `LIMIT`.
- **So sánh Thứ tự viết ↔ Thứ tự thực thi** & **SQLite `EXPLAIN QUERY PLAN`**.
- **3 bộ dữ liệu mẫu tiếng Việt**: Quản lý Sinh viên, Thương mại Điện tử, Quản lý Nhân sự cùng 13 câu truy vấn mẫu từ Cơ bản đến Nâng cao.
- **Hỗ trợ Sáng / Tối (Dark Mode)** và **Diff View** cho các câu lệnh `INSERT`, `UPDATE`, `DELETE`.

## Cài đặt & chạy cục bộ

```bash
npm install
npm run dev
```

Mở trình duyệt tại `http://127.0.0.1:5173/`.

## Kiểm thử & Build

```bash
npm test      # Chạy unit test đối chiếu bộ mô phỏng từng bước với SQLite WASM
npm run build # Kiểm tra TypeScript và đóng gói production vào thư mục dist/
```
