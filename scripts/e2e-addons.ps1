$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:3000"
function New-Session([int]$uid) {
  $s = $null
  Invoke-RestMethod -Uri "$base/api/auth/switch" -Method POST -ContentType "application/json" -Body ([System.Text.Encoding]::UTF8.GetBytes("{`"userId`":$uid}")) -SessionVariable s | Out-Null
  return $s
}
function Post-Json($session, [string]$path, $obj) {
  $json = $obj | ConvertTo-Json -Depth 6 -Compress
  return Invoke-RestMethod -Uri "$base$path" -Method POST -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -WebSession $session
}
function Get-Json($session, [string]$path) {
  return Invoke-RestMethod -Uri "$base$path" -WebSession $session
}

# 0) 重置到种子
Invoke-RestMethod -Uri "$base/api/demo/reset" -Method POST -Headers @{ Authorization = "Bearer shunlu-demo-2026" } | Out-Null
"reset ok"

$a = New-Session 1
$b = New-Session 2

# 1) 发布页同楼提示带捎带件数
$nearby = Get-Json $a "/api/hall/nearby?building=$([uri]::EscapeDataString('女寝3号楼'))"
"nearby: " + (($nearby.orders | ForEach-Object { "$($_.id):addon=$($_.addonCount)" }) -join ", ")

# 2) A 发一张带捎带项的外卖单
$created = Post-Json $a "/api/orders" @{
  bizType = "food"; pickupPoint = "东门外卖柜"; dropBuilding = "女寝3号楼"; dropFloor = 4; dropRoom = "412";
  phoneTail = "8899"; itemDesc = "炸鸡一份"; rewardFen = 500; acceptMinutes = 15;
  addons = @(@{ title = "可乐 1 瓶"; budgetFen = 400 }, @{ title = "纸巾 1 包"; budgetFen = 300 })
}
$oid = $created.order.id
"created order $oid reward=$($created.order.rewardFen) budget=$($created.order.budgetFen) runnerReward=$($created.order.runnerRewardFen)"

$walletA = Get-Json $a "/api/wallet"
"walletA freeze log: " + (($walletA.logs | Select-Object -First 1 | ForEach-Object { "$($_.type) $($_.amountFen) | $($_.memo)" }))

# 3) B 接单 + 看详情（隐私字段 & 捎带项）
Post-Json $b "/api/orders/accept" @{ orderIds = @($oid) } | Out-Null
$detailB = Get-Json $b "/api/orders/$oid"
"B detail: room=$($detailB.order.dropRoom) tail=$($detailB.order.phoneTail) canReportAddons=$($detailB.order.canReportAddons)"
"addons: " + (($detailB.order.addons | ForEach-Object { "$($_.title)/$($_.budgetFen)/$($_.status)" }) -join "; ")

# 4) B 取到 + 上报捎带实付（可乐 450，纸巾没买到）
Post-Json $b "/api/orders/$oid/actions" @{ action = "pick" } | Out-Null
$report = Post-Json $b "/api/orders/$oid/addons" @{
  items = @(
    @{ id = $detailB.order.addons[0].id; actualFen = 450 },
    @{ id = $detailB.order.addons[1].id; failed = $true }
  )
}
"report: total=$($report.totalActualFen) over=$($report.overBudgetFen)"

# 5) B 送达
Post-Json $b "/api/orders/$oid/actions" @{ action = "deliver"; proofPhotoUrl = "https://example.com/proof.jpg" } | Out-Null
$detailA = Get-Json $a "/api/orders/$oid"
"preview: refund=$($detailA.order.settlePreview.refundFen) actual=$($detailA.order.settlePreview.addonActualFen) runnerTake=$($detailA.order.settlePreview.runnerTakeFen) cost=$($detailA.order.settlePreview.publisherCostFen) canConfirm=$($detailA.order.canConfirm)"

# 6) A 确认收货
$confirm = Post-Json $a "/api/orders/$oid/confirm" @{}
"settlement: " + ($confirm.settlement | ConvertTo-Json -Compress)

$walletA2 = Get-Json $a "/api/wallet"
"walletA logs: " + (($walletA2.logs | Select-Object -First 4 | ForEach-Object { "$($_.type):$($_.amountFen)" }) -join ", ")
$walletB2 = Get-Json $b "/api/wallet"
"walletB logs: " + (($walletB2.logs | Select-Object -First 4 | ForEach-Object { "$($_.type):$($_.amountFen)" }) -join ", ")
"balanceA=$($walletA2.user.balanceFen) balanceB=$($walletB2.user.balanceFen)"

# 7) 页面可访问
$pub = Invoke-WebRequest -Uri "$base/publish" -WebSession $a -UseBasicParsing
$det = Invoke-WebRequest -Uri "$base/orders/$oid" -WebSession $a -UseBasicParsing
"pages: publish=$($pub.StatusCode) detail=$($det.StatusCode) detailHasAddons=$(($det.Content -match '捎带清单'))"

