const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_EXPIRES_IN = '7d'; // الـ Token صالح لمدة أسبوع، بعدها لازم تسجّل دخول تاني

/**
 * POST /api/auth/register
 * بيعمل حساب مستخدم جديد (اسم مستخدم + باسورد)
 *
 * ⚠️ ملحوظة أمان: الـ endpoint ده مفتوح لأي حد يعرف الرابط - أي حد يقدر يسجّل حساب.
 * ده مناسب لمرحلة التطوير/الفريق الصغير. لو المشروع هيتفتح للعامة، لازم تقفل التسجيل
 * أو تحطه وراء صلاحية "أدمن بس يقدر يضيف مستخدمين جداد".
 */
async function register(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'محتاج اسم مستخدم وباسورد' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'الباسورد لازم يكون 6 حروف على الأقل' });
    }

    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'اسم المستخدم ده مستخدم قبل كده' });
    }

    // نشفّر الباسورد قبل التخزين - أبدًا منخزنش الباسورد كنص عادي
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({ username: username.toLowerCase(), passwordHash });

    res.status(201).json({
      message: 'تم إنشاء الحساب بنجاح',
      userId: user._id,
      username: user.username
    });

  } catch (err) {
    console.error('خطأ في التسجيل:', err);
    res.status(500).json({ error: 'حصل خطأ أثناء إنشاء الحساب', details: err.message });
  }
}

/**
 * POST /api/auth/login
 * بيتحقق من الباسورد، ولو صح بيرجع JWT Token يُستخدم في باقي الطلبات
 */
async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'محتاج اسم مستخدم وباسورد' });
    }

    const user = await User.findOne({ username: username.toLowerCase() });

    // ملحوظة أمان: بنرجع نفس رسالة الخطأ سواء اسم المستخدم غلط أو الباسورد غلط
    // عشان مانديش لأي حد معلومة "اسم المستخدم ده موجود فعلاً بس الباسورد غلط"
    if (!user) {
      return res.status(401).json({ error: 'اسم المستخدم أو الباسورد غلط' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'اسم المستخدم أو الباسورد غلط' });
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token,
      expiresIn: JWT_EXPIRES_IN
    });

  } catch (err) {
    console.error('خطأ في تسجيل الدخول:', err);
    res.status(500).json({ error: 'حصل خطأ أثناء تسجيل الدخول', details: err.message });
  }
}

module.exports = { register, login };
