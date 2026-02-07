// ──────────────────────────────────────────────────────────────────────────────
// Multer Configuration
// File upload middleware for PDFs and Excel files
// ──────────────────────────────────────────────────────────────────────────────

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure waivers directory exists
const waiversDir = path.join(__dirname, '..', '..', 'public_uploads', 'waivers');
if (!fs.existsSync(waiversDir)){
    fs.mkdirSync(waiversDir, { recursive: true });
}

// Configure multer for PDF uploads (General)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', '..', 'public_uploads'));
  },
  filename: function (req, file, cb) {
    // Always save as canva.pdf to replace the existing one
    cb(null, 'canva.pdf');
  }
});

// Configure multer for Trip Waivers
const waiverStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, waiversDir);
  },
  filename: function (req, file, cb) {
    // timestamp_filename.pdf to avoid collisions and cache issues
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
  }
});

const waiverUpload = multer({
  storage: waiverStorage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Configure multer for Excel uploads
const excelStorage = multer.memoryStorage();
const excelUpload = multer({
  storage: excelStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  }
});

module.exports = {
  upload,
  waiverUpload,
  excelUpload,
};
