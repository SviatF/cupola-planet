#!/usr/bin/env node
import assert from "node:assert/strict";
import {mkdirSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {chromium}=require("/tmp/cupola-eclipse-lab-browser/node_modules/playwright");
const base="http://127.0.0.1:3100";
const folder="eclipse-lab-browser-evidence";
mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({headless:true,args:[
  "--no-sandbox","--enable-webgl","--use-gl=angle","--use-angle=swiftshader"
]});
const report={status:"PENDING",url:base+"/eclipse-lab",images:[],errors:[]};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",err=>errors.push(err.message));
  page.on("console",msg=>{
    if(msg.type()==="error" && /WebGLProgram|Shader Error|THREE.WebGLProgram|GLSL/i.test(msg.text()))
      errors.push(msg.text());
  });
  const response=await page.goto(base+"/eclipse-lab",{waitUntil:"domcontentloaded",timeout:90000});
  assert.equal(response?.status(),200);
  await page.locator('[data-eclipse-lab="simulation"]').waitFor({state:"visible"});
  await page.locator('[data-eclipse-lab-canvas="active"]').waitFor({state:"visible",timeout:60000});
  await page.getByText("SIMULATION · NOT LIVE").waitFor({state:"visible"});
  await page.waitForFunction(()=>document.body.textContent.includes("NASA LROC + LOLA ACTIVE"),
    null,{timeout:55000});
  report.nasaTextures="NASA LROC + LOLA ACTIVE";
  await page.screenshot({path:folder+"/desktop-total.png",animations:"disabled",timeout:20000});
  report.images.push("desktop-total.png");
  const peak=Number(await page.locator("[data-eclipse-obscuration]").getAttribute("data-eclipse-obscuration"));
  assert.ok(peak>0.1,"Default total eclipse must register Earth shadow");
  report.defaultCentreObscuration=peak;
  assert.equal(await page.locator("#eclipse-danjon").inputValue(),"1",
    "Reviewed dark-brown L1 must stay the default");
  const sceneCanvas=page.locator('[data-eclipse-lab-canvas="active"]');
  await page.waitForFunction(()=>Number(document.querySelector(
    '[data-eclipse-lab-canvas="active"]')?.dataset.eclipseLabRenderCount||0)>0);
  const beforeIdle=Number(await sceneCanvas.getAttribute("data-eclipse-lab-render-count"));
  await page.waitForTimeout(850);
  const afterIdle=Number(await sceneCanvas.getAttribute("data-eclipse-lab-render-count"));
  assert.equal(afterIdle,beforeIdle,"Idle Eclipse Lab must not render at 60 fps");
  report.idleStrategy="ON_DEMAND_NO_IDLE_RAF";
  await page.locator("#eclipse-danjon").selectOption("4");
  await page.waitForFunction(before=>Number(document.querySelector(
    '[data-eclipse-lab-canvas="active"]')?.dataset.eclipseLabRenderCount||0)>before,
    afterIdle);
  assert.equal(await page.locator("[data-eclipse-danjon]").getAttribute(
    "data-eclipse-danjon"),"4");
  await page.screenshot({path:folder+"/danjon-l4.png",animations:"disabled",timeout:20000});
  report.images.push("danjon-l4.png");
  await page.locator("#eclipse-danjon").selectOption("0");
  await page.screenshot({path:folder+"/danjon-l0.png",animations:"disabled",timeout:20000});
  report.images.push("danjon-l0.png");
  await page.locator("#eclipse-danjon").selectOption("1");
  const utc0=await page.locator("[data-eclipse-lab-utc]").getAttribute("data-eclipse-lab-utc");
  await page.getByRole("button",{name:"+15 MIN"}).click();
  const utc1=await page.locator("[data-eclipse-lab-utc]").getAttribute("data-eclipse-lab-utc");
  assert.equal(Date.parse(utc1)-Date.parse(utc0),15*60000,
    "Moving QA clock must advance only replay time");
  await page.getByRole("button",{name:"RESET"}).click();
  assert.equal(await page.locator("[data-eclipse-lab-utc]").getAttribute("data-eclipse-lab-utc"),utc0);
  await page.locator("#eclipse-event").selectOption("2026-aug");
  const partial=await page.locator("[data-eclipse-lab-utc]").getAttribute("data-eclipse-lab-utc");
  assert.equal(partial,"2026-08-28T04:12:49.000Z");
  await page.screenshot({path:folder+"/desktop-partial.png",animations:"disabled",timeout:20000});
  report.images.push("desktop-partial.png");
  await page.locator("#eclipse-datetime").fill("2025-03-14T06:58");
  assert.equal(await page.locator("#eclipse-event").inputValue(),"custom");
  const custom=await page.locator("[data-eclipse-lab-utc]").getAttribute("data-eclipse-lab-utc");
  assert.equal(custom,"2025-03-14T06:58:00.000Z");
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:folder+"/mobile.png",animations:"disabled",timeout:20000});
  report.images.push("mobile.png");
  const widths=await page.evaluate(()=>{
    const panel=document.querySelector(".eclipse-lab-panel");
    return {viewport:innerWidth,panel:panel?.getBoundingClientRect().width||0,
      body:document.documentElement.scrollWidth};
  });
  assert.ok(widths.panel<=widths.viewport+1,"Mobile controls must fit viewport");
  assert.ok(widths.body<=widths.viewport+2,"Mobile must not overflow horizontally");
  assert.equal(errors.length,0,"GPU/React Moon errors: "+errors.join("; "));
  const home=await page.request.get(base+"/",{timeout:25000});
  assert.equal(home.status(),200,"Normal LIVE CUPOLA page must remain available");
  report.status="PASS";report.mobile=widths;report.errors=errors;
  console.log("PASS: isolated Eclipse Lab, real NASA textures, time controls, WebGL and mobile");
}finally{
  await browser.close();
  writeFileSync(folder+"/report.json",JSON.stringify(report,null,2));
}
