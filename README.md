# 财税代办小程序 · 微信云开发后端

本仓库已实现 PRD v1.2 的数据库、云函数、后台前端、角色权限、登录鉴权和正式部署。

## 已实现

- 集合：`orders`、`complaints`、`admin_users`；订单支持 `assigned_staff`，账号支持 `admin/operator` 角色及启停状态
- 云函数：`adminLogin`、`getOrders`、`getOrderDetail`、`updateOrderStatus`、`getComplaints`、`resolveComplaint`、`claimOrder`、`getDashboardStats`、`getOperators`、`createOperator`、`toggleOperatorStatus`；另保留 `updateOperatorStatus` 兼容现有前端
- JWT 8 小时登录态、bcrypt 密码校验、账号状态实时校验、分页/枚举/长度校验
- 订单状态与 `status_logs` 在同一次原子更新中写入
- 运营只能查看未分配或自己的订单；领取订单与更新状态均使用数据库条件原子更新
- 管理员拥有全局数据看板和运营账号管理；运营拥有个人数据看板
- 后台前端：登录页、订单工作台、订单详情页、运营账号管理页
- 品牌统一显示为“名创财税”
- CloudBase 匿名登录仅承担传输层会话，后台业务权限由 `adminLogin` JWT 和云函数角色校验承担
- 小程序端恢复“企业查询 → 服务办理 → 办理记录”三入口；企业信息可自动带入下单页，办理记录按当前微信用户 `openid` 隔离查询
- 小程序 UI/UX 对齐企业认证参考稿：首页搜索、服务详情、订单支付筛选和联系客服；用户投诉由 `createComplaint` 校验订单归属后写入后台工单
- 工商年报提供基础、升级、至尊三档套餐，管理员可在“服务套餐”页面随时修改名称、价格、说明和上下架状态

## 后台前端

前端工程位于 `admin-web/`，使用 React、Vite 和 CloudBase Web SDK：

```bash
cd admin-web
npm install
npm run dev
```

生产构建与静态托管部署：

```bash
cd admin-web
npm run build
npx tcb hosting deploy dist -e cloud1-d9gju2ncx57d61c07
```

Web 端开启 CloudBase 匿名登录作为传输层会话。后台账号只需存在于 `admin_users` 集合，密码以 bcrypt 哈希保存；业务登录由 `adminLogin` 校验并签发 JWT。

### 网关与客户端安全规则

- OPA 用户策略允许 `anonymous` 身份调用 `functions` 资源。
- 云函数客户端安全规则为 `{"*":{"invoke":"auth != null"}}`，拒绝完全未登录的请求，同时允许已建立的匿名会话。
- 除 `adminLogin` 外，所有业务函数都必须携带有效 JWT；敏感操作还会实时读取账号角色和启停状态。

### 登录态安全

- 业务 JWT 有效期为 8 小时，前端读取 `exp` 并在到期时自动清除本地登录态、跳转登录页。
- 页面重新获得焦点、从后台恢复以及跨标签页修改登录态时，都会重新检查 token。
- 任一受保护云函数返回 `UNAUTHORIZED`，或 CloudBase 传输层会话失效，都会统一退出。
- 退出登录会同时清除业务 JWT 并注销 CloudBase 传输层会话。
- 直接访问 `#/orders` 或订单详情等受保护路由时，没有有效 token 会返回登录页。

正式发布使用根目录的一键命令；它会先执行后端测试、语法检查、前端鉴权测试和生产构建，全部通过后才上传：

```bash
npm run deploy:admin
```

## 部署前配置

1. 复制 `project.config.example.json` 为 `project.config.json`，填入小程序 AppID，并用微信开发者工具打开本目录。真实配置已被 Git 忽略，不会上传到仓库。
2. 选择目标云开发环境，创建 `orders`、`complaints`、`admin_users` 三个集合。
3. 将三个集合的权限都设为“所有用户不可读写”。索引按 `database/collections.json` 创建。
4. 给十二个云函数设置相同环境变量：`ADMIN_JWT_SECRET`，值为至少 32 位的随机字符串。
5. 对每个云函数选择“上传并部署：云端安装依赖”。

可在本地生成安全随机密钥（只复制到云函数环境变量，不要提交到 Git）：

```bash
npm run generate-jwt-secret
```

项目已配置为使用官方 CloudBase CLI 部署十二个函数：

```bash
LANTERN_ADMIN_JWT_SECRET="$(npm run --silent generate-jwt-secret)" npx tcb fn deploy --all
```

上面的命令用于首次部署。之后仅更新代码时，使用以下命令可保留线上 JWT 密钥和其他函数配置：

```bash
npx tcb fn code update adminLogin
```

将函数名替换为需要更新的函数；不要在已有登录会话时重新生成并覆盖 `ADMIN_JWT_SECRET`，否则现有 token 会立即失效。

## 初始化管理员

先生成密码哈希：

```bash
npm install
npm run hash-password -- "你的强密码"
```

在 `admin_users` 集合新增：

```json
{
  "username": "admin",
  "password_hash": "上一步生成的 bcrypt 哈希",
  "display_name": "管理员",
  "role": "admin",
  "status": "active",
  "created_at": "使用云数据库日期类型填写当前时间"
}
```

不要把明文密码、JWT 密钥或真实 AppID 提交到 Git。

## 企业查询配置

`searchCompany` 支持两种天眼查鉴权方式，优先读取已有静态 token：

```text
TYC_TOKEN=你的天眼查token
```

也可以配置 OAuth 客户端：`TYC_CLIENT_ID` 与 `TYC_CLIENT_SECRET`。以上凭证只放在云函数环境变量中，不要写入仓库。

## 初始化正式套餐

以下命令会幂等写入三档已上架套餐，套餐说明先留空，后续可在管理后台编辑：

```bash
npm run init-products
```

- 基础套餐：¥199
- 升级套餐：¥299
- 至尊套餐：¥399

也可以使用初始化脚本直接写入目标云环境；明文密码仅通过进程环境变量传入，不会保存到仓库：

```bash
ADMIN_INITIAL_USERNAME="admin" \
ADMIN_INITIAL_DISPLAY_NAME="测试管理员" \
ADMIN_INITIAL_PASSWORD="你的初始密码" \
npm run init-admin
```

`admin_users.username` 有唯一索引，脚本不会覆盖同名账号。

## 云函数调用约定

成功：`{ "success": true, ... }`

失败：`{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "..." } }`

除 `adminLogin` 外，其他函数均需传入登录返回的 `token`。运营账号由管理员在“运营账号”页面创建，密码同样只保存 bcrypt 哈希。
