const CITY_POIS = {
  tokyo: [
    { name: "淺草寺", type: "outdoor", lat: 35.7148, lon: 139.7967, stay: 90, cost: 0, open: "06:00", close: "17:00" },
    { name: "上野博物館", type: "indoor", lat: 35.7188, lon: 139.7765, stay: 90, cost: 620, open: "09:30", close: "17:00" },
    { name: "晴空塔", type: "indoor", lat: 35.7101, lon: 139.8107, stay: 80, cost: 2100, open: "10:00", close: "21:00" },
    { name: "澀谷十字路口", type: "outdoor", lat: 35.6595, lon: 139.7005, stay: 60, cost: 0, open: "00:00", close: "23:59" },
    { name: "代代木公園", type: "outdoor", lat: 35.6728, lon: 139.6949, stay: 75, cost: 0, open: "05:00", close: "20:00" }
  ],
  taipei: [
    { name: "台北101", type: "indoor", lat: 25.0339, lon: 121.5645, stay: 80, cost: 600, open: "11:00", close: "21:00" },
    { name: "中正紀念堂", type: "outdoor", lat: 25.0355, lon: 121.5213, stay: 60, cost: 0, open: "09:00", close: "18:00" },
    { name: "故宮博物院", type: "indoor", lat: 25.1024, lon: 121.5485, stay: 100, cost: 350, open: "09:00", close: "17:00" },
    { name: "象山步道", type: "outdoor", lat: 25.0271, lon: 121.5705, stay: 90, cost: 0, open: "05:00", close: "22:00" },
    { name: "華山文創園區", type: "mixed", lat: 25.0441, lon: 121.5299, stay: 70, cost: 0, open: "10:00", close: "21:00" }
  ],
  paris: [
    { name: "羅浮宮", type: "indoor", lat: 48.8606, lon: 2.3376, stay: 120, cost: 730, open: "09:00", close: "18:00" },
    { name: "艾菲爾鐵塔", type: "outdoor", lat: 48.8584, lon: 2.2945, stay: 90, cost: 900, open: "09:00", close: "23:00" },
    { name: "奧賽博物館", type: "indoor", lat: 48.8600, lon: 2.3266, stay: 90, cost: 560, open: "09:30", close: "18:00" },
    { name: "蒙馬特", type: "outdoor", lat: 48.8867, lon: 2.3431, stay: 75, cost: 0, open: "00:00", close: "23:59" },
    { name: "杜樂麗花園", type: "outdoor", lat: 48.8635, lon: 2.3270, stay: 60, cost: 0, open: "07:00", close: "21:00" }
  ]
};

const form = document.querySelector("#planner-form");
const loading = document.querySelector("#loading");
const result = document.querySelector("#result");
const summary = document.querySelector("#summary");
const weatherEl = document.querySelector("#weather");
const itineraryEl = document.querySelector("#itinerary");
const alternativesEl = document.querySelector("#alternatives");

document.querySelector("#date").valueAsDate = new Date();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  loading.classList.remove("hidden");
  result.classList.add("hidden");

  const input = {
    city: document.querySelector("#city").value.trim(),
    date: document.querySelector("#date").value,
    startTime: document.querySelector("#startTime").value,
    endTime: document.querySelector("#endTime").value,
    budget: Number(document.querySelector("#budget").value),
    preference: document.querySelector("#preference").value
  };

  try {
    const plan = await buildPlan(input);
    render(plan, input);
  } catch (err) {
    summary.innerHTML = `<p class="warning">規劃失敗：${err.message}</p>`;
    weatherEl.innerHTML = "";
    itineraryEl.innerHTML = "";
    alternativesEl.innerHTML = "";
    result.classList.remove("hidden");
  } finally {
    loading.classList.add("hidden");
  }
});

async function buildPlan(input) {
  const geo = await geocodeCity(input.city);
  const weather = await getWeather(geo.lat, geo.lon);

  const pois = pickPois(input.city);
  const sorted = rankPoisByPreference(pois, input.preference, weather.rainProbability);
  const route = buildRoute(sorted, input.startTime, input.endTime, input.preference);

  const totals = route.reduce(
    (acc, stop) => {
      acc.cost += stop.transport.cost + stop.poi.cost;
      acc.minutes += stop.transport.duration + stop.poi.stay;
      return acc;
    },
    { cost: 0, minutes: 0 }
  );

  return {
    cityResolved: geo.name,
    weather,
    route,
    totals,
    alternatives: suggestAlternatives(route, input.preference)
  };
}

function pickPois(cityInput) {
  const key = cityInput.toLowerCase();
  return CITY_POIS[key] || CITY_POIS.tokyo;
}

function rankPoisByPreference(pois, pref, rainProbability) {
  return [...pois].sort((a, b) => scorePoi(b, pref, rainProbability) - scorePoi(a, pref, rainProbability));
}

function scorePoi(poi, pref, rainProbability) {
  let score = 50;
  if (poi.type === "indoor") score += 10;
  if (poi.cost === 0) score += 8;
  if (pref === "cheapest" && poi.cost === 0) score += 20;
  if (pref === "fastest") score += Math.max(0, 120 - poi.stay) / 4;
  if (pref === "avoid_rain" && rainProbability > 60 && poi.type === "indoor") score += 30;
  if (pref === "avoid_rain" && rainProbability > 60 && poi.type === "outdoor") score -= 20;
  if (pref === "less_walking" && poi.type === "outdoor") score -= 10;
  return score;
}

function buildRoute(sortedPois, startTime, endTime, preference) {
  const minutesWindow = toMinutes(endTime) - toMinutes(startTime);
  let usedMinutes = 0;
  const route = [];

  for (const poi of sortedPois) {
    const transport = simulateTransport(poi, preference);
    const needed = transport.duration + poi.stay;
    if (usedMinutes + needed > minutesWindow) continue;
    route.push({ poi, transport });
    usedMinutes += needed;
  }

  return route;
}

function simulateTransport(poi, preference) {
  const baseKm = 3 + (poi.stay % 5);
  const options = [
    { mode: "捷運/地鐵", duration: Math.round(baseKm * 4 + 8), cost: Math.round(baseKm * 22 + 10) },
    { mode: "公車", duration: Math.round(baseKm * 5 + 10), cost: Math.round(baseKm * 15 + 8) },
    { mode: "計程車", duration: Math.round(baseKm * 3 + 6), cost: Math.round(baseKm * 60 + 70) }
  ];

  if (preference === "cheapest") return options.reduce((a, b) => (a.cost < b.cost ? a : b));
  if (preference === "fastest") return options.reduce((a, b) => (a.duration < b.duration ? a : b));
  if (preference === "less_walking") return options[2];
  return options[0];
}

function suggestAlternatives(route, preference) {
  const baseCost = route.reduce((sum, s) => sum + s.transport.cost + s.poi.cost, 0);
  const baseMinutes = route.reduce((sum, s) => sum + s.transport.duration + s.poi.stay, 0);
  return [
    { strategy: preference === "cheapest" ? "fastest" : "cheapest", totalCost: Math.round(baseCost * 0.82) },
    { strategy: preference === "fastest" ? "balanced" : "fastest", totalMinutes: Math.round(baseMinutes * 0.86) }
  ];
}

async function geocodeCity(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("無法取得城市座標");
  const data = await res.json();
  if (!data.results?.length) throw new Error("找不到這個城市，請換英文城市名再試一次");
  const r = data.results[0];
  return { lat: r.latitude, lon: r.longitude, name: `${r.name}, ${r.country}` };
}

async function getWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("無法取得天氣資訊");
  const d = await res.json();
  return {
    code: d.daily.weather_code[0],
    high: d.daily.temperature_2m_max[0],
    low: d.daily.temperature_2m_min[0],
    rainProbability: d.daily.precipitation_probability_max[0]
  };
}

function render(plan, input) {
  const budgetDelta = input.budget - plan.totals.cost;
  summary.innerHTML = `
    <p><span class="badge">${plan.cityResolved}</span><span class="badge">${input.date}</span></p>
    <p>總移動 + 停留時間：約 <b>${plan.totals.minutes}</b> 分鐘</p>
    <p>預估花費：<b>${plan.totals.cost}</b> TWD（預算差額：<b>${budgetDelta}</b>）</p>
  `;

  const rainWarning = plan.weather.rainProbability > 60
    ? `<p class="warning">今日降雨機率 ${plan.weather.rainProbability}%：已優先安排室內景點，建議攜帶雨具。</p>`
    : "";

  weatherEl.innerHTML = `
    <h3>當地天氣（預報）</h3>
    <p>最高 ${plan.weather.high}°C / 最低 ${plan.weather.low}°C，降雨機率 ${plan.weather.rainProbability}%</p>
    ${rainWarning}
  `;

  itineraryEl.innerHTML = "";
  plan.route.forEach((stop, idx) => {
    const li = document.createElement("li");
    li.className = "stop";
    li.innerHTML = `
      <b>${idx + 1}. ${stop.poi.name}</b>（${stop.poi.type}）<br />
      <small>交通：${stop.transport.mode}｜時間 ${stop.transport.duration} 分鐘｜費用 ${stop.transport.cost} TWD</small><br />
      <small>停留：${stop.poi.stay} 分鐘｜門票/花費：${stop.poi.cost} TWD</small>
    `;
    itineraryEl.appendChild(li);
  });

  alternativesEl.innerHTML = plan.alternatives
    .map((a) => `<li>${a.strategy}：${a.totalCost ? `總花費約 ${a.totalCost} TWD` : `總時間約 ${a.totalMinutes} 分鐘`}</li>`)
    .join("");

  result.classList.remove("hidden");
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
