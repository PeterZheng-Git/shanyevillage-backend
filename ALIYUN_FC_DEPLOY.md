# 阿里云函数计算部署指南

## 方式一：Serverless Devs CLI（推荐）

### 1. 安装 Serverless Devs

```bash
npm install -g @serverless-devs/s
```

### 2. 初始化项目

```bash
cd Backend
s init
# 选择 "Node.js Express 框架"
```

### 3. 配置 s.yaml

```yaml
edition: 1.0.0
name: shanye-backend
access: default  # 你的阿里云密钥别名

services:
  express-app:
    component: express
    props:
      region: ap-southeast-1  # 新加坡 region（亚太）
      runtime: Nodejs18
      handler: serverless.handler  # 入口文件
      memorySize: 512
      timeout: 60
      environmentVariables:
        # 环境变量
        DATABASE_URL: your_database_url
        JWT_SECRET: your_jwt_secret
        NODE_ENV: production
      layers:
        # 可选：添加依赖层
```

### 4. 部署

```bash
s deploy
```

---

## 方式二：直接上传（控制台手动）

### 1. 登录阿里云函数计算控制台
https://fc.console.aliyun.com/

### 2. 创建服务
- 区域：新加坡（ap-southeast-1）
- 服务名：shanye-backend

### 3. 创建函数
- 运行环境：Node.js 18
- 请求处理程序：`serverless.handler`
- 上传代码包（zip）

### 4. 配置环境变量

在函数配置中添加以下环境变量：

| 变量名 | 值 |
|:---|:---|
| DATABASE_URL | `postgresql://postgres.xxx:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require` |
| JWT_SECRET | 你的 JWT 密钥 |
| NODE_ENV | `production` |
| PORT | `9000` |
| JWT_EXPIRES_IN | `30d` |
| ADMIN_USERNAME | `admin` |
| ADMIN_PASSWORD | `ShanYeAdmin2025` |
| APPLE_IAP_SANDBOX | `false` |
| SMS_MOCK_MODE | `true` |
| CLOUDINARY_CLOUD_NAME | 你的云名 |
| CLOUDINARY_API_KEY | 你的 API Key |
| CLOUDINARY_API_SECRET | 你的 API Secret |

### 5. 配置触发器

创建 HTTP 触发器：
- 认证方式：无
- 请求方法：ANY

---

## 重要配置

### 内存和超时
- 内存：512 MB（Node.js + Express + PostgreSQL 需要一定内存）
- 超时时间：60 秒（首次冷启动需要时间）

### VPC 配置（可选）
如果需要访问内网 Supabase：
1. 创建 VPC
2. 配置 NAT 网关
3. 将函数加入 VPC

### 日志配置
- 开启日志服务
- 设置日志库：simple

---

## 获取函数 URL

部署成功后，在函数详情页获取：
- 公网访问地址格式：`https://{service}-{account-id}.{region}.fcappdelegation.net/{path}`

这个地址就是你的后端 API 地址，记得更新到 iOS AppConfig.swift 中！
