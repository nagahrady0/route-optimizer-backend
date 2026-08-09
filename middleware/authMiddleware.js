const jwt = require('jsonwebtoken');

/**
 * Middleware بيتحقق إن الطلب معاه JWT Token صالح قبل ما يسمح بالمرور
 * الطلب لازم يبعت الـ Token في الهيدر كده:
 * Authorization: Bearer <token>
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'محتاج تسجّل دخول الأول (Token مفقود)' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // نحط بيانات المستخدم على الـ request عشان أي controller بعد كده يقدر يعرف مين اللي بيستخدم
    req.user = decoded;
    next();
  } catch (err) {
    // ممكن يكون الـ Token منتهي الصلاحية أو مزوّر
    return res.status(401).json({ error: 'الـ Token غير صالح أو منتهي الصلاحية، سجّل دخول تاني' });
  }
}

module.exports = { requireAuth };
