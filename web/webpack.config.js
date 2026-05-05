const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode !== 'production';

  return {
    mode: isDev ? 'development' : 'production',
    entry: './src/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'bundle.js',
      publicPath: 'auto'
    },
    module: {
      rules: [
        {
          test: /\.mjs$/,
          include: /node_modules/,
          type: 'javascript/auto',
          resolve: {
            fullySpecified: false,
          },
        },
        {
          test: /\.(ts|tsx|js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-react',
                  {
                    runtime: 'automatic',
                    development: isDev
                  }
                ],
                '@babel/preset-env',
                '@babel/preset-typescript'
              ]
            }
          }
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader', 'postcss-loader']
        },
        {
          test: /\.(png|jpe?g|gif|webp|ico|svg)$/i,
          type: 'asset',
          parser: { dataUrlCondition: { maxSize: 8 * 1024 } }
        },
        {
          test: /\.(woff2?|eot|ttf|otf)$/i,
          type: 'asset/resource'
        },
        {
          // 兜底规则：PDF、文档、音视频等所有其他文件一律输出为独立资源文件
          exclude: /\.(js|jsx|ts|tsx|mjs|css|json|html)$/i,
          type: 'asset/resource'
        }
      ]
    },
    resolve: {
      extensions: ['.mjs', '.ts', '.tsx', '.js', '.jsx']
    },
    devServer: {
      port: 3266,
      allowedHosts: 'all',
      historyApiFallback: {
        index: '/index.html',
        rewrites: [
          { from: /^\/_p\/\d+\//, to: '/index.html' }
        ]
      },
      proxy: {
        '/api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false
        },
        '/auth': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/auth': '/api/auth' }
        },
        '/dashboard-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/dashboard-api': '/api/dashboard-api' }
        },
        '/alerts-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/alerts-api': '/api/alerts-api' }
        },
        '/assets-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/assets-api': '/api/assets-api' }
        },
        '/notifications': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/notifications': '/api/notifications' }
        },
        '/roles-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/roles-api': '/api/roles-api' }
        },
        '/audit-logs-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/audit-logs-api': '/api/audit-logs-api' }
        },
        '/users-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/users-api': '/api/users-api' }
        },
        '/scans-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/scans-api': '/api/scans-api' }
        },
        '/playbooks-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/playbooks-api': '/api/playbooks-api' }
        },
        '/event-actions-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/event-actions-api': '/api/event-actions-api' }
        },
        '/datasources-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/datasources-api': '/api/datasources-api' }
        },
        '/log-types-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/log-types-api': '/api/log-types-api' }
        },
        '/rules-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/rules-api': '/api/rules-api' }
        },
        '/hunting-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/hunting-api': '/api/hunting-api' }
        },
        '/ai-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/ai-api': '/api/ai-api' }
        },
        '/vulnerabilities-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/vulnerabilities-api': '/api/vulnerabilities-api' }
        },
        '/products-api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
          pathRewrite: { '^/products-api': '/api/products-api' }
        }
      }
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './index.html',
        inject: 'body'
      })
    ]
  };
};
