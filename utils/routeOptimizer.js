/**
 * صيغة Haversine لحساب المسافة بين نقطتين على سطح الأرض (بالمتر)
 * مناسبة هنا لأننا مش محتاجين مسار الطريق الفعلي، بس تقدير كويس للمسافة المستقيمة
 */
function haversineDistance(point1, point2) {
  const R = 6371000; // نصف قطر الأرض بالمتر
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(point2.lat - point1.lat);
  const dLng = toRad(point2.lng - point1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(point1.lat)) *
      Math.cos(toRad(point2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * بيبني مصفوفة المسافات بين كل نقطتين (شاملة نقطة البداية في الإندكس 0)
 * points[0] = نقطة البداية، وباقي points = نقاط التسليم
 */
function buildDistanceMatrix(points) {
  const n = points.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = haversineDistance(points[i], points[j]);
      matrix[i][j] = dist;
      matrix[j][i] = dist;
    }
  }

  return matrix;
}

/**
 * خوارزمية Nearest Neighbor: تبدأ من نقطة البداية (index 0)
 * وفي كل خطوة تختار أقرب نقطة مش اتزارت لسه
 * بترجع ترتيب indices (مش شامل نقطة البداية نفسها)
 */
function nearestNeighborRoute(distanceMatrix) {
  const n = distanceMatrix.length;
  const visited = new Array(n).fill(false);
  visited[0] = true; // نقطة البداية

  const route = [];
  let current = 0;

  for (let step = 0; step < n - 1; step++) {
    let nearest = -1;
    let nearestDist = Infinity;

    for (let j = 0; j < n; j++) {
      if (!visited[j] && distanceMatrix[current][j] < nearestDist) {
        nearest = j;
        nearestDist = distanceMatrix[current][j];
      }
    }

    visited[nearest] = true;
    route.push(nearest);
    current = nearest;
  }

  return route;
}

/**
 * بتحسب إجمالي مسافة مسار معين (شامل نقطة البداية في الأول)
 * route هنا عبارة عن indices بدون نقطة البداية (0)
 */
function calculateRouteDistance(route, distanceMatrix) {
  let total = 0;
  let prev = 0; // نقطة البداية

  for (const point of route) {
    total += distanceMatrix[prev][point];
    prev = point;
  }

  return total;
}

/**
 * تحسين 2-opt: بيجرب يبدّل قطعتين من المسار ويشوف لو المسافة قلّت
 * بيكرر لحد ما محدش تحسين ممكن يحصل (local optimum)
 * ده اللي بيرفع جودة نتيجة Nearest Neighbor بشكل ملحوظ
 */
function twoOptImprove(route, distanceMatrix) {
  let improved = true;
  let bestRoute = [...route];
  let bestDistance = calculateRouteDistance(bestRoute, distanceMatrix);

  while (improved) {
    improved = false;

    for (let i = 0; i < bestRoute.length - 1; i++) {
      for (let j = i + 1; j < bestRoute.length; j++) {
        // نجرب نعكس الجزء بين i و j
        const newRoute = [
          ...bestRoute.slice(0, i),
          ...bestRoute.slice(i, j + 1).reverse(),
          ...bestRoute.slice(j + 1)
        ];

        const newDistance = calculateRouteDistance(newRoute, distanceMatrix);

        if (newDistance < bestDistance) {
          bestRoute = newRoute;
          bestDistance = newDistance;
          improved = true;
        }
      }
    }
  }

  return { route: bestRoute, distance: bestDistance };
}

/**
 * الدالة الرئيسية: بتاخد نقطة البداية + قايمة نقاط التسليم
 * وبترجع الترتيب الأمثل + المسافة من كل نقطة للي قبلها + الإجمالي
 *
 * @param {{lat: number, lng: number}} startPoint
 * @param {Array<{lat: number, lng: number, [key: string]: any}>} deliveryPoints
 * @returns {{ orderedLocations: Array, totalDistance: number }}
 */
function optimizeRoute(startPoint, deliveryPoints) {
  if (deliveryPoints.length === 0) {
    return { orderedLocations: [], totalDistance: 0 };
  }

  // نبني مصفوفة النقاط: index 0 = نقطة البداية، الباقي = نقاط التسليم بترتيبها الأصلي
  const allPoints = [startPoint, ...deliveryPoints];
  const distanceMatrix = buildDistanceMatrix(allPoints);

  // الخطوة 1: نجيب مسار مبدئي بـ Nearest Neighbor
  const initialRoute = nearestNeighborRoute(distanceMatrix);

  // الخطوة 2: نحسّنه بـ 2-opt
  const { route: optimizedRoute, distance: totalDistance } = twoOptImprove(
    initialRoute,
    distanceMatrix
  );

  // نبني النتيجة النهائية: كل نقطة ومعاها ترتيب زيارتها والمسافة من اللي قبلها
  const orderedLocations = [];
  let prevIndex = 0; // نقطة البداية

  optimizedRoute.forEach((pointIndex, order) => {
    const originalDeliveryPoint = deliveryPoints[pointIndex - 1]; // -1 لأن index 0 كان نقطة البداية
    const distanceFromPrevious = distanceMatrix[prevIndex][pointIndex];

    orderedLocations.push({
      ...originalDeliveryPoint,
      visitOrder: order,
      distanceFromPrevious: Math.round(distanceFromPrevious)
    });

    prevIndex = pointIndex;
  });

  return {
    orderedLocations,
    totalDistance: Math.round(totalDistance)
  };
}

module.exports = { optimizeRoute, haversineDistance };
