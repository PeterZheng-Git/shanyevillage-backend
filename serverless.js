/**
 * 阿里云函数计算入口 - serverless.js
 * 用于阿里云函数计算部署
 */
const serverless = require('serverless-http')
const app = require('./src/index')

// 导出 handler 函数（阿里云函数计算标准格式）
const handler = serverless(app, {
  // 阿里云函数计算的特殊配置
  basePath: '/',
  // 确保请求体正确解析
  request: (request) => {
    // 阿里云函数计算会将请求体作为 Buffer 传入
    if (request.body && Buffer.isBuffer(request.body)) {
      request.body = request.body.toString()
    }
  }
})

module.exports = { handler }
