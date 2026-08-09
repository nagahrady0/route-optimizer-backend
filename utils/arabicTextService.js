const ArabicReshaper = require('arabic-reshaper');

/**
 * ⚠️ ملحوظة تقنية مهمة:
 * مكتبة pdfkit مبنية أصلاً للغات اللاتينية LTR، ومفيهاش دعم مدمج لتشكيل
 * الحروف العربية (letter joining) ولا لعكس اتجاه الكتابة RTL. علشان كده:
 *
 * 1) بنستخدم "arabic-reshaper" اللي بتحوّل كل حرف عربي للشكل الصحيح بتاعه
 *    حسب موقعه في الكلمة (أول/وسط/آخر/منفصل) - من غير كده الحروف هتتطبع
 *    منفصلة عن بعض وغير متصلة زي ما إحنا متعودين نشوفها.
 *
 * 2) بنعكس ترتيب الكلمات يدويًا (RTL) لأن pdfkit بيطبع من الشمال لليمين افتراضيًا.
 *    الأرقام والحروف الإنجليزية جوه النص (زي "شارع 90") بتفضل بترتيبها الطبيعي
 *    لأننا بنعكس ترتيب الكلمات بس، مش كل حرف لوحده.
 *
 * الحل ده مناسب تمامًا لسطور قصيرة زي العناوين، ومش هدفنا نعمل محرك bidi
 * كامل الميزات (زي اللي في المتصفحات).
 */

function shapeArabic(text) {
  return ArabicReshaper.convertArabic(text);
}

function prepareArabicForPdf(text) {
  const shaped = shapeArabic(text);
  // نعكس ترتيب الكلمات (مش الحروف جوه كل كلمة) عشان يبان RTL صح
  return shaped.split(' ').reverse().join(' ');
}

module.exports = { prepareArabicForPdf };
