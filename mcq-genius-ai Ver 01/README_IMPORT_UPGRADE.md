# MCQ ZINUS - nâng cấp nhập câu hỏi

Thay mã nguồn dự án trong Google AI Studio bằng các tệp trong gói này, giữ nguyên cấu trúc thư mục. Phần nâng cấp nằm ở `src/utils/pdfParser.ts`, `src/utils/fileParser.ts`, `src/components/FileUploadModal.tsx`, `src/App.tsx`, `src/types/quiz.ts` và các màn hình hiển thị câu hỏi.

## Kiểm tra với file mẫu

`BLOCK 1-2 NỘI TIM MẠCH.pdf`: 80 câu (40 câu/block), 80 ID riêng, 17 ảnh trích từ PDF và gắn theo vị trí trên trang. Bộ đáp án chưa có trong PDF này; nhập file đáp án riêng để các câu đủ điều kiện vào đề thi.

## Lưu ý khi nhập tài liệu khác

- Hình PDF được cắt theo vị trí ảnh hiển thị rồi gắn vào câu mang ID gần nhất phía trước, kể cả khi hình nằm ở trang tiếp theo.
- Hình DOCX được gắn theo vị trí thẻ ảnh trong văn bản. Nếu tài liệu không có ID câu hỏi, cần kiểm tra hình trong màn hình xem trước.
- Câu thiếu lựa chọn hoặc đáp án được lưu để sửa nhưng không được đưa vào bài thi.
- PDF dạng ảnh quét hoàn toàn (không có lớp văn bản) cần OCR riêng; luồng này chưa có OCR.

Chạy tại máy: `npm install`, `npm run dev`. Kiểm tra kiểu: `npm run lint`.
