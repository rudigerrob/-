# 旅遊 App 系統設計（路線 + 交通 + 花費 + 天氣整合）

## A. 問題定義

目標：輸入旅遊地點與時間，產出可執行的最佳化行程，並整合交通、花費、天氣。

### 輸入
- 起點/終點（或僅目的城市）
- 旅遊日期範圍
- 每日可活動時段
- 使用者偏好（省時、省錢、少步行、室內優先）
- 旅遊型態（親子、長輩、情侶、背包客）
- 預算上限

### 輸出
- 每日景點順序
- 每段交通工具建議（多方案）
- 預估移動時間與費用
- 天氣風險提示與備案路線

## B. 核心模組

1. **Trip Service**：旅程建立、儲存、版本管理
2. **POI Service**：景點資料（營業時間、票價、類型）
3. **Routing Service**：路線與交通方式計算
4. **Cost Engine**：交通/門票/餐飲預估
5. **Weather Service**：即時天氣與預報
6. **Optimizer Engine**：最佳化評分與重排
7. **Notification Service**：出發提醒、壞天氣改道提醒

## C. 資料流

1. 客戶端提交旅程需求。
2. Backend 併發呼叫 POI、Routing、Weather。
3. Optimizer 產生候選行程（3~5 組）。
4. Cost Engine 計算各候選方案成本。
5. 回傳最佳方案 + 2 組備選。
6. 透過快取保存結果，避免重複計算。

## D. 資料模型（簡化）

### `trips`
- `id` (UUID)
- `user_id`
- `city`
- `start_date`, `end_date`
- `daily_start_time`, `daily_end_time`
- `budget_total`
- `preference_profile` (JSONB)

### `trip_days`
- `id`, `trip_id`, `date`
- `weather_snapshot` (JSONB)
- `total_cost_estimate`
- `total_travel_minutes`

### `stops`
- `id`, `trip_day_id`, `sequence`
- `poi_id`
- `arrival_time`, `leave_time`
- `stay_minutes`
- `backup_poi_id`

### `legs`
- `id`, `trip_day_id`, `from_stop_id`, `to_stop_id`
- `mode` (walk/bus/metro/taxi/train)
- `duration_minutes`
- `cost_amount`
- `co2_estimate`

## E. API 設計（MVP）

### 1) 建立旅程
`POST /api/v1/trips`

```json
{
  "city": "Tokyo",
  "startDate": "2026-04-03",
  "endDate": "2026-04-07",
  "dailyWindow": { "start": "09:00", "end": "21:00" },
  "budgetTotal": 35000,
  "preferences": {
    "optimizeFor": "balanced",
    "walkingTolerance": "medium",
    "indoorPriorityIfRain": true
  }
}
```

### 2) 取得最佳行程
`GET /api/v1/trips/{tripId}/itinerary?includeAlternatives=true`

回傳：最佳方案、替代方案、總成本、風險說明。

### 3) 一鍵重排
`POST /api/v1/trips/{tripId}/replan`

```json
{
  "strategy": "avoid_rain",
  "lockStops": ["s1", "s2"]
}
```

## F. 最佳化策略

### 目標函數

最小化：
- 總交通時間
- 總花費
- 過度步行
- 壞天氣暴露
- 轉乘複雜度

最大化：
- 景點偏好匹配度
- 路線順暢度

### 建議演算法
- 小規模（日行程 < 12 站）：
  - Time-window aware TSP + 2-opt
- 中大型規模：
  - 遺傳演算法 / 模擬退火
- 即時改道：
  - 以局部重排為主（保持已完成與鎖定點）

## G. 天氣整合細節

- 每 1~3 小時拉取預報，寫入 weather cache。
- 若降雨機率 > 60%：
  - 降低戶外景點評分
  - 提升室內景點權重
- 若高溫/低溫警示：
  - 建議縮短戶外停留
  - 插入休息點（咖啡廳/商場）

## H. 成本估算策略

成本 = 交通 + 門票 + 餐飲 + 彈性緩衝

- 交通：依即時/歷史票價 + 尖峰係數
- 門票：官方票價 + 季節係數
- 餐飲：用戶偏好（平價/中價/高價）估算區間
- 緩衝：建議 10~15%

## I. 非功能需求

- 可用性：99.9%（旅遊中斷風險高）
- 回應時間：
  - 初次排程 < 3 秒（快取命中）
  - 冷啟計算 < 12 秒
- 可觀測性：
  - tracing + metrics + itinerary quality score
- 隱私：
  - 位置資料最小化存放
  - 敏感欄位加密（at-rest + in-transit）

## J. 里程碑建議

### Phase 1（4 週）
- 完成 MVP（輸入、排程、交通、天氣、費用）
- 單城市上線（例如東京）

### Phase 2（4~6 週）
- 多城市、多語系
- 即時改道與推播

### Phase 3（6+ 週）
- 協作行程
- AI 導遊問答
- 個人化推薦模型
