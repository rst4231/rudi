const {test,expect}=require('@playwright/test');
for(const theme of ['light','dark'])test(`cold launch shows Home while app script is still loading, ${theme}`,async({page})=>{
 await page.emulateMedia({colorScheme:theme});
 await page.route('**/app.js?*',()=>{});
 await page.goto('/',{waitUntil:'commit'});
 await expect(page.locator('body')).toHaveClass(/auth-pending/);
 await expect(page.locator('body')).toHaveAttribute('data-app-tab','home');
 await expect(page.locator('#appStartupPreview')).toBeVisible();
 await expect(page.locator('.priority-section')).toBeHidden();
 await expect(page.locator('.footer')).toBeHidden();
 await expect(page.locator('#appGate')).toBeHidden();
 const width=await page.evaluate(()=>document.documentElement.scrollWidth);
 expect(width).toBeLessThanOrEqual(390);
 await page.screenshot({path:test.info().outputPath('startup-'+theme+'.png')});
});
