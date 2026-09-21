const {defineConfig,devices}=require('@playwright/test');

module.exports=defineConfig({
  testDir:'./tests/ui',
  timeout:30000,
  expect:{timeout:7000},
  workers:1,
  retries:0,
  use:{
    baseURL:'http://127.0.0.1:4173',
    ...devices['iPhone 13'],
    locale:'ru-RU',
    timezoneId:'Europe/Moscow',
    colorScheme:'dark',
    trace:'retain-on-failure'
  },
  webServer:{
    command:'node tests/ui/server.cjs',
    url:'http://127.0.0.1:4173',
    reuseExistingServer:false,
    timeout:15000
  }
});
