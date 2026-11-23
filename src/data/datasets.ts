import type { SampleDataset } from '../types/sql';

export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'university',
    name: 'Quản lý Sinh viên',
    shortName: 'Sinh viên',
    description: 'Hệ thống đại học gồm Khoa, Sinh viên, Học phần và Bảng điểm đăng ký.',
    icon: 'graduation',
    schemaSql: `
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  building TEXT NOT NULL
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  dept_id INTEGER REFERENCES departments(id),
  year INTEGER NOT NULL,
  gpa REAL NOT NULL,
  city TEXT NOT NULL
);

CREATE TABLE courses (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  credits INTEGER NOT NULL,
  dept_id INTEGER REFERENCES departments(id)
);

CREATE TABLE enrollments (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  course_id INTEGER NOT NULL REFERENCES courses(id),
  semester TEXT NOT NULL,
  score REAL NOT NULL
);
`,
    seedSql: `
INSERT INTO departments (id, name, building) VALUES
  (1, 'Công nghệ Thông tin', 'Tòa B1'),
  (2, 'Khoa học Dữ liệu', 'Tòa B2'),
  (3, 'Kinh tế Số', 'Tòa C1'),
  (4, 'Thiết kế Đồ họa', 'Tòa A3');

INSERT INTO students (id, full_name, dept_id, year, gpa, city) VALUES
  (1, 'Nguyễn Minh Anh', 1, 3, 8.9, 'Hà Nội'),
  (2, 'Trần Quốc Bảo', 1, 2, 7.4, 'TP.HCM'),
  (3, 'Lê Thu Hà', 2, 4, 9.2, 'Đà Nẵng'),
  (4, 'Phạm Đức Huy', 1, 3, 6.8, 'Hà Nội'),
  (5, 'Võ Khánh Linh', 2, 2, 8.5, 'TP.HCM'),
  (6, 'Đỗ Gia Minh', 3, 3, 7.9, 'Hải Phòng'),
  (7, 'Hoàng Thảo Nhi', 3, 1, 8.3, 'Hà Nội'),
  (8, 'Bùi Tuấn Kiệt', 2, 4, 6.4, 'Cần Thơ');

INSERT INTO courses (id, code, title, credits, dept_id) VALUES
  (101, 'CS201', 'Cơ sở Dữ liệu', 4, 1),
  (102, 'CS202', 'Cấu trúc Dữ liệu', 4, 1),
  (103, 'DS301', 'Học máy Ứng dụng', 3, 2),
  (104, 'EC105', 'Kinh tế Lượng', 3, 3),
  (105, 'GD101', 'Tư duy Thiết kế', 2, 4);

INSERT INTO enrollments (id, student_id, course_id, semester, score) VALUES
  (1, 1, 101, '2026-1', 9.2),
  (2, 1, 102, '2026-1', 8.6),
  (3, 2, 101, '2026-1', 7.0),
  (4, 3, 101, '2026-1', 9.5),
  (5, 3, 103, '2026-1', 9.0),
  (6, 4, 102, '2026-1', 6.5),
  (7, 5, 103, '2026-1', 8.8),
  (8, 5, 101, '2026-1', 8.2),
  (9, 6, 104, '2026-1', 7.8),
  (10, 7, 104, '2026-1', 8.4);
`,
    presets: [
      {
        id: 'uni-full-pipeline',
        title: 'Luồng đầy đủ: Khoa có điểm TB cao',
        level: 'Nâng cao',
        tags: ['JOIN', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT'],
        description: 'Trực quan hóa trọn vẹn 7 bước thực thi từ FROM đến LIMIT trên bảng sinh viên & điểm số.',
        sql: `SELECT d.name AS khoa,
       COUNT(e.id) AS luot_thi,
       ROUND(AVG(e.score), 2) AS diem_tb
FROM students s
INNER JOIN departments d ON s.dept_id = d.id
INNER JOIN enrollments e ON s.id = e.student_id
WHERE e.score >= 7.0
GROUP BY d.name
HAVING COUNT(e.id) >= 2
ORDER BY diem_tb DESC
LIMIT 3;`,
      },
      {
        id: 'uni-where-order',
        title: 'Lọc sinh viên giỏi & Sắp xếp GPA',
        level: 'Cơ bản',
        tags: ['FROM', 'WHERE', 'SELECT', 'ORDER BY', 'LIMIT'],
        description: 'Quan sát cách WHERE lọc bỏ các dòng không đạt điều kiện trước khi SELECT và ORDER BY.',
        sql: `SELECT full_name AS ho_ten,
       year AS nam_hoc,
       gpa,
       city AS thanh_pho
FROM students
WHERE gpa >= 8.0 AND city != 'Cần Thơ'
ORDER BY gpa DESC, full_name ASC
LIMIT 4;`,
      },
      {
        id: 'uni-left-join',
        title: 'LEFT JOIN: Tìm sinh viên chưa đăng ký môn',
        level: 'Trung bình',
        tags: ['LEFT JOIN', 'NULL', 'ORDER BY'],
        description: 'So sánh trực quan các dòng khớp và dòng sinh viên không có bản ghi điểm (sinh ra giá trị NULL).',
        sql: `SELECT s.full_name AS sinh_vien,
       s.gpa,
       e.course_id AS ma_mon,
       e.score AS diem
FROM students s
LEFT JOIN enrollments e ON s.id = e.student_id
ORDER BY e.score DESC;`,
      },
      {
        id: 'uni-group-having',
        title: 'GROUP BY & HAVING: Thống kê theo thành phố',
        level: 'Trung bình',
        tags: ['GROUP BY', 'HAVING', 'COUNT', 'AVG'],
        description: 'Xem các dòng gom lại thành từng nhóm theo thành phố và bộ lọc HAVING loại bỏ nhóm nhỏ.',
        sql: `SELECT city AS thanh_pho,
       COUNT(*) AS so_sv,
       ROUND(AVG(gpa), 2) AS gpa_tb,
       MAX(gpa) AS gpa_cao_nhat
FROM students
GROUP BY city
HAVING COUNT(*) >= 2
ORDER BY gpa_tb DESC;`,
      },
      {
        id: 'uni-distinct',
        title: 'DISTINCT: Danh sách thành phố duy nhất',
        level: 'Cơ bản',
        tags: ['SELECT', 'DISTINCT', 'ORDER BY'],
        description: 'Minh họa cách DISTINCT đánh dấu và loại bỏ các dòng trùng lặp sau khi chiếu cột.',
        sql: `SELECT DISTINCT city AS thanh_pho
FROM students
ORDER BY city ASC;`,
      },
      {
        id: 'uni-subquery',
        title: 'Truy vấn con: Sinh viên có GPA trên trung bình',
        level: 'Nâng cao',
        tags: ['WHERE', 'Subquery', 'ORDER BY'],
        description: 'Kết hợp truy vấn con trong mệnh đề WHERE để lọc sinh viên vượt mức trung bình toàn trường.',
        sql: `SELECT full_name AS ho_ten,
       gpa,
       city AS thanh_pho
FROM students
WHERE gpa > (SELECT AVG(gpa) FROM students)
ORDER BY gpa DESC;`,
      },
    ],
  },
  {
    id: 'ecommerce',
    name: 'Thương mại Điện tử',
    shortName: 'Bán hàng',
    description: 'Cửa hàng trực tuyến gồm Khách hàng, Sản phẩm, Đơn hàng và Chi tiết đơn hàng.',
    icon: 'shopping',
    schemaSql: `
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT NOT NULL,
  region TEXT NOT NULL
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_date TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL
);
`,
    seedSql: `
INSERT INTO customers (id, name, tier, region) VALUES
  (1, 'Minh Quân', 'Gold', 'Miền Bắc'),
  (2, 'Thanh Trúc', 'Platinum', 'Miền Nam'),
  (3, 'Hoàng Nam', 'Silver', 'Miền Trung'),
  (4, 'Ngọc Hân', 'Gold', 'Miền Nam'),
  (5, 'Quốc Đạt', 'Silver', 'Miền Bắc'),
  (6, 'Phương Anh', 'Bronze', 'Miền Trung');

INSERT INTO products (id, name, category, price) VALUES
  (1, 'Bàn phím Cơ K8', 'Phụ kiện', 1800),
  (2, 'Chuột Không Dây Pro', 'Phụ kiện', 950),
  (3, 'Màn hình 27" 4K', 'Màn hình', 7500),
  (4, 'Tai nghe Chống Ồn', 'Âm thanh', 3200),
  (5, 'Đế tản nhiệt Laptop', 'Phụ kiện', 450),
  (6, 'Loa Bluetooth Mini', 'Âm thanh', 1200);

INSERT INTO orders (id, customer_id, order_date, status) VALUES
  (101, 1, '2026-10-05', 'completed'),
  (102, 2, '2026-10-08', 'completed'),
  (103, 2, '2026-10-14', 'completed'),
  (104, 3, '2026-10-18', 'cancelled'),
  (105, 4, '2026-10-21', 'completed'),
  (106, 5, '2026-10-25', 'pending');

INSERT INTO order_items (id, order_id, product_id, quantity) VALUES
  (1, 101, 1, 2),
  (2, 101, 2, 1),
  (3, 102, 3, 1),
  (4, 102, 4, 2),
  (5, 103, 1, 1),
  (6, 104, 5, 3),
  (7, 105, 4, 1),
  (8, 105, 6, 2),
  (9, 106, 2, 2);
`,
    presets: [
      {
        id: 'ecom-revenue-category',
        title: 'Doanh thu theo Danh mục (Đơn hoàn thành)',
        level: 'Nâng cao',
        tags: ['JOIN', 'WHERE', 'GROUP BY', 'SUM', 'ORDER BY'],
        description: 'Nối 3 bảng đơn hàng, chi tiết và sản phẩm, lọc đơn hoàn thành rồi tính tổng doanh thu từng danh mục.',
        sql: `SELECT p.category AS danh_muc,
       SUM(oi.quantity) AS tong_sl,
       SUM(oi.quantity * p.price) AS doanh_thu
FROM orders o
INNER JOIN order_items oi ON o.id = oi.order_id
INNER JOIN products p ON oi.product_id = p.id
WHERE o.status = 'completed'
GROUP BY p.category
HAVING SUM(oi.quantity * p.price) >= 4000
ORDER BY doanh_thu DESC;`,
      },
      {
        id: 'ecom-customer-left-join',
        title: 'LEFT JOIN: Khách hàng & Lịch sử đặt hàng',
        level: 'Trung bình',
        tags: ['LEFT JOIN', 'NULL', 'ORDER BY'],
        description: 'Phát hiện khách hàng Phương Anh chưa có đơn hàng nào thông qua giá trị NULL sinh ra từ LEFT JOIN.',
        sql: `SELECT c.name AS khach_hang,
       c.tier AS hang,
       o.id AS ma_don,
       o.status AS trang_thai
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
ORDER BY o.id ASC;`,
      },
      {
        id: 'ecom-product-filter',
        title: 'Lọc sản phẩm tầm trung & Phân trang',
        level: 'Cơ bản',
        tags: ['WHERE', 'BETWEEN', 'ORDER BY', 'LIMIT', 'OFFSET'],
        description: 'Minh họa lọc khoảng giá BETWEEN cùng phân trang LIMIT / OFFSET.',
        sql: `SELECT name AS san_pham,
       category AS danh_muc,
       price AS gia_nghin
FROM products
WHERE price BETWEEN 900 AND 5000
ORDER BY price DESC
LIMIT 3 OFFSET 1;`,
      },
      {
        id: 'ecom-vip-spending',
        title: 'Top khách hàng chi tiêu cao nhất',
        level: 'Nâng cao',
        tags: ['Multi-JOIN', 'GROUP BY', 'SUM', 'LIMIT'],
        description: 'Tính tổng chi tiêu của từng khách hàng đã hoàn tất đơn và chọn top 3.',
        sql: `SELECT c.name AS khach_hang,
       c.tier AS hang,
       COUNT(DISTINCT o.id) AS so_don,
       SUM(oi.quantity * p.price) AS tong_chi
FROM customers c
INNER JOIN orders o ON c.id = o.customer_id
INNER JOIN order_items oi ON o.id = oi.order_id
INNER JOIN products p ON oi.product_id = p.id
WHERE o.status = 'completed'
GROUP BY c.name, c.tier
ORDER BY tong_chi DESC
LIMIT 3;`,
      },
    ],
  },
  {
    id: 'hr',
    name: 'Quản lý Nhân sự',
    shortName: 'Nhân sự',
    description: 'Doanh nghiệp công nghệ gồm Phòng ban, Nhân viên, Dự án và Phân công công việc.',
    icon: 'briefcase',
    schemaSql: `
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  budget INTEGER NOT NULL
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  dept_id INTEGER REFERENCES departments(id),
  role TEXT NOT NULL,
  salary INTEGER NOT NULL,
  years_exp INTEGER NOT NULL
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  dept_id INTEGER REFERENCES departments(id),
  priority TEXT NOT NULL
);

CREATE TABLE assignments (
  id INTEGER PRIMARY KEY,
  emp_id INTEGER NOT NULL REFERENCES employees(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  hours_per_week INTEGER NOT NULL
);
`,
    seedSql: `
INSERT INTO departments (id, name, budget) VALUES
  (1, 'Kỹ thuật Phần mềm', 500),
  (2, 'Dữ liệu & AI', 420),
  (3, 'Sản phẩm & Thiết kế', 300),
  (4, 'Vận hành', 200);

INSERT INTO employees (id, name, dept_id, role, salary, years_exp) VALUES
  (1, 'Lê Hoàng Việt', 1, 'Tech Lead', 48, 7),
  (2, 'Nguyễn Mỹ Duyên', 1, 'Backend Dev', 32, 4),
  (3, 'Trần Anh Tú', 1, 'Frontend Dev', 26, 2),
  (4, 'Phạm Ngọc Mai', 2, 'Data Scientist', 42, 5),
  (5, 'Đặng Gia Huy', 2, 'ML Engineer', 38, 4),
  (6, 'Vũ Thanh Tâm', 3, 'Product Manager', 40, 6),
  (7, 'Bùi Khánh Vy', 3, 'UI/UX Designer', 28, 3),
  (8, 'Ngô Minh Trí', 4, 'DevOps', 35, 5);

INSERT INTO projects (id, title, dept_id, priority) VALUES
  (10, 'Nền tảng Thanh toán v2', 1, 'High'),
  (11, 'Hệ thống Gợi ý AI', 2, 'High'),
  (12, 'Thiết kế App Mobile', 3, 'Medium'),
  (13, 'Tự động hóa CI/CD', 4, 'Low');

INSERT INTO assignments (id, emp_id, project_id, hours_per_week) VALUES
  (1, 1, 10, 25),
  (2, 2, 10, 35),
  (3, 3, 10, 30),
  (4, 3, 12, 10),
  (5, 4, 11, 35),
  (6, 5, 11, 40),
  (7, 6, 12, 20),
  (8, 7, 12, 35);
`,
    presets: [
      {
        id: 'hr-dept-salary',
        title: 'Quỹ lương & Lương TB theo Phòng ban',
        level: 'Trung bình',
        tags: ['JOIN', 'GROUP BY', 'HAVING', 'AVG', 'SUM'],
        description: 'Gom nhân viên theo phòng ban, lọc những phòng có từ 2 nhân sự trở lên và xếp hạng theo lương trung bình.',
        sql: `SELECT d.name AS phong_ban,
       COUNT(e.id) AS so_nhan_su,
       ROUND(AVG(e.salary), 1) AS luong_tb,
       SUM(e.salary) AS quy_luong
FROM employees e
INNER JOIN departments d ON e.dept_id = d.id
GROUP BY d.name
HAVING COUNT(e.id) >= 2
ORDER BY luong_tb DESC;`,
      },
      {
        id: 'hr-senior-filter',
        title: 'Lọc nhân sự có kinh nghiệm & Phân loại bậc',
        level: 'Cơ bản',
        tags: ['WHERE', 'CASE WHEN', 'ORDER BY'],
        description: 'Sử dụng biểu thức CASE WHEN trong SELECT sau khi lọc kinh nghiệm từ 4 năm trở lên.',
        sql: `SELECT name AS nhan_vien,
       role AS chuc_vu,
       salary AS luong_tr,
       CASE
         WHEN salary >= 40 THEN 'Cao cấp'
         ELSE 'Trung cấp'
       END AS cap_bac
FROM employees
WHERE years_exp >= 4
ORDER BY salary DESC;`,
      },
      {
        id: 'hr-unassigned',
        title: 'LEFT JOIN: Nhân viên & Số giờ dự án',
        level: 'Trung bình',
        tags: ['LEFT JOIN', 'NULL', 'ORDER BY'],
        description: 'Kiểm tra phân bổ dự án của nhân sự và nhận diện nhân viên chưa được gán dự án nào.',
        sql: `SELECT e.name AS nhan_vien,
       e.role AS vai_tro,
       a.project_id AS ma_du_an,
       a.hours_per_week AS gio_tuan
FROM employees e
LEFT JOIN assignments a ON e.id = a.emp_id
ORDER BY a.hours_per_week DESC;`,
      },
    ],
  },
];
