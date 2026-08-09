const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');

// إنشاء حساب جديد
router.post('/register', register);

// تسجيل الدخول - بيرجع JWT Token
router.post('/login', login);

module.exports = router;
