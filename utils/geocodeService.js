const LocationCache = require('../models/LocationCache');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// بننضّف النص عشان يبقى مفتاح بحث موحّد في الكاش
// (لو نفس العنوان جه مرة بمسافات زيادة أو حروف كبيرة، يتعرف عليه برضو)
function normalizeAddress(address) {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

// تأخير بسيط بين الطلبات - Nominatim بيسمح بطلب واحد كل ثانية بس
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * بينادي Nominatim API فعليًا (بدون كاش)
 * بيرجع { lat, lng } أو null لو معرفش يلاقي العنوان
 */
async function fetchFromNominatim(address) {
  const params = new URLSearchParams({
    q: address,
    format: 'json',
    limit: '1',
    countrycodes: 'eg' // نحصر البحث في مصر بما إن المشروع مصري
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: {
      // Nominatim بيطلب User-Agent واضح، وبيرفض الطلبات من غيره أحيانًا
      'User-Agent': 'RouteOptimizerApp/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim رجع status ${response.status}`);
  }

  const results = await response.json();

  if (!results || results.length === 0) {
    return null; // العنوان معرفش يتلاقي
  }

  return {
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon)
  };
}

/**
 * بيحوّل عنوان واحد لإحداثيات، مع الاستفادة من الكاش الأول
 * @param {string} rawAddress - العنوان زي ما جه من الإكسل
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
async function geocodeAddress(rawAddress) {
  const normalized = normalizeAddress(rawAddress);

  // 1) ندور في الكاش الأول
  const cached = await LocationCache.findOne({ normalizedAddress: normalized });
  if (cached) {
    return { lat: cached.lat, lng: cached.lng, fromCache: true };
  }

  // 2) لو مش موجود، ننادي Nominatim فعليًا
  const result = await fetchFromNominatim(rawAddress);

  if (!result) {
    return null; // فشل - العنوان معرفش يتحول
  }

  // 3) نخزّن النتيجة في الكاش عشان المرات الجاية
  await LocationCache.create({
    normalizedAddress: normalized,
    rawAddress,
    lat: result.lat,
    lng: result.lng,
    provider: 'nominatim'
  });

  return { lat: result.lat, lng: result.lng, fromCache: false };
}

/**
 * بيحوّل قايمة عناوين كاملة (locations بتاعة Trip واحدة)
 * ومراعي حد الاستخدام بتاع Nominatim (طلب كل ثانية) بس للعناوين اللي مش في الكاش
 * @param {Array} locations - مصفوفة locations من موديل Trip
 * @returns {Promise<Array>} - نفس المصفوفة بعد ما اتملت lat/lng/geocodeStatus
 */
async function geocodeLocationsList(locations) {
  const updatedLocations = [];

  for (const loc of locations) {
    try {
      const result = await geocodeAddress(loc.rawAddress);

      if (result) {
        updatedLocations.push({
          ...(loc.toObject ? loc.toObject() : loc),
          lat: result.lat,
          lng: result.lng,
          geocodeStatus: 'success'
        });
      } else {
        updatedLocations.push({
          ...(loc.toObject ? loc.toObject() : loc),
          geocodeStatus: 'failed'
        });
      }

      // نستنى ثانية بس لو الطلب فعلاً راح لـ Nominatim (مش من الكاش)
      // عشان منكسرش الـ Rate Limit بتاعهم
      if (result && !result.fromCache) {
        await sleep(1000);
      }

    } catch (err) {
      console.error(`فشل geocoding للعنوان: ${loc.rawAddress}`, err.message);
      updatedLocations.push({
        ...(loc.toObject ? loc.toObject() : loc),
        geocodeStatus: 'failed'
      });
      await sleep(1000); // نستنى برضو حتى لو فشل عشان منضربش الـ API بسرعة زيادة
    }
  }

  return updatedLocations;
}

module.exports = { geocodeAddress, geocodeLocationsList };
