const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/car.js','utf8');
const adviceSource=source.slice(source.indexOf('  function tyreForecastAdvice('),source.indexOf('  function tyreSeason('));
const loadSource=source.slice(source.indexOf('  async function loadWeather('),source.indexOf('  async function loadCar(',source.indexOf('  async function loadWeather(')));

function forecast(mins,maxs){
  return {current:{temperature_2m:12,weather_code:0},daily:{temperature_2m_min:mins,temperature_2m_max:maxs}};
}
function harness(data){
  return vm.runInNewContext(adviceSource+loadSource+'\n({loadWeather,tyreForecastAdvice})',{
    state:{weather:null},window:{RUDI_WEATHER:{get:async()=>data}},
    document:{body:{dataset:{appTab:'home'}}},render(){},
  });
}

test('cold weather after the first seven days cannot request winter tyres now',async()=>{
  const data=forecast([...Array(7).fill(8),...Array(9).fill(-10)],[...Array(7).fill(16),...Array(9).fill(-2)]);
  const {loadWeather,tyreForecastAdvice}=harness(data);
  const weather=await loadWeather();
  assert.equal(weather.avgMean,12);
  assert.equal(weather.minForecast,8);
  assert.equal(tyreForecastAdvice(weather).season,'summer');
  assert.equal(data.daily.temperature_2m_min.length,16);
});

test('warm weather after the first seven days cannot hide a cold week',async()=>{
  const {loadWeather,tyreForecastAdvice}=harness(forecast([...Array(7).fill(2),...Array(9).fill(15)],[...Array(7).fill(6),...Array(9).fill(25)]));
  assert.equal(tyreForecastAdvice(await loadWeather()).season,'winter');
});

test('missing temperatures never become a zero-degree forecast',async()=>{
  const {loadWeather,tyreForecastAdvice}=harness(forecast([],[]));
  assert.equal(tyreForecastAdvice(await loadWeather()).kind,'unknown');
  assert.equal(tyreForecastAdvice({avgMean:null,minForecast:null}).kind,'unknown');
});

test('tyre thresholds retain the borderline range and frost warning',()=>{
  const {tyreForecastAdvice}=harness(null);
  assert.equal(tyreForecastAdvice({avgMean:7,minForecast:3}).season,'winter');
  assert.equal(tyreForecastAdvice({avgMean:8,minForecast:3}).kind,'borderline');
  assert.equal(tyreForecastAdvice({avgMean:10,minForecast:5}).kind,'borderline');
  assert.equal(tyreForecastAdvice({avgMean:10,minForecast:6}).season,'summer');
  assert.equal(tyreForecastAdvice({avgMean:8,minForecast:0}).kind,'frost');
});
