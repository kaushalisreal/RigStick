import {chromium} from './support/playwright.mjs';
import assert from 'node:assert/strict';
// Library panel states with a stand-in for the desktop library
// API: the web explanation, filtering, recovering from
// an empty search, the card and library menus.
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.stack));
const check=(name,value)=>{assert.ok(value,name);console.log('PASS',name);};
const labels=async menu=>(await menu.locator('[role^="menuitem"] > span:first-of-type').allTextContents()).join('|');
try{
  await page.goto(process.env.RIGS_URL||'http://127.0.0.1:47831');await page.waitForFunction(()=>rigs.ready);
  await page.locator('#library-tab').click();
  // A browser keeps its own library (src/web-library.mjs); tests/web-library.browser.mjs exercises it for real.
  await page.getByText('No saved assets yet').waitFor();
  check('the browser keeps a library of its own',await page.getByLabel('Search library').isVisible()&&!(await page.getByText('Library is available in the desktop app').isVisible()));
  await page.evaluate(async ()=>{
    const entries=[{kind:'folder',name:'Characters',path:'Characters',modified:1},{kind:'figure',name:'Walker',path:'Walker.stkz',modified:1},{kind:'movieclip',name:'Punch combo',path:'Punch.rigsmov',modified:1},{kind:'set',name:'Crowd',path:'Crowd.stkz',modified:1}];

    const lib=rigs.library;lib.desktop={listLibrary:async folder=>({path:folder||'',root:'Library',entries:folder?[]:entries}),getLibraryThumbnail:async()=>null,revealLibrary:async()=>{}};
    await lib.refresh('');
  });
  const cards=page.locator('.library-card');
  check('all assets are listed with a count',await cards.count()===4&&await page.locator('.library-count').textContent()==='4 items');
  check('the cards are one listbox with a single tab stop',await page.locator('.library-grid[role="listbox"]').count()===1&&await page.locator('.library-card[tabindex="0"]').count()===1);
  check('the old action bar and footer controls are gone',await page.locator('.library-item-actions, .library-footer-row, [data-library-filter]').count()===0);
  await page.getByLabel('Show',{exact:true}).selectOption('movieclip');
  check('the Movieclips filter keeps folders and movieclips',await cards.count()===2);
  await page.getByLabel('Show',{exact:true}).selectOption('figure');
  check('the Figures filter includes figure sets',await cards.count()===3);
  await page.getByLabel('Search library').fill('zzz');
  check('an empty search explains itself',await page.getByText('No matches').isVisible());
  await page.getByRole('button',{name:'Clear search',exact:true}).click();
  check('clearing restores every asset and the All filter',await cards.count()===4&&await page.getByLabel('Search library').inputValue()===''&&await page.getByLabel('Show',{exact:true}).inputValue()==='all');
  await page.locator('[data-library-path="Walker.stkz"]').click();
  await page.mouse.move(5,5);await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-library-path="Walker.stkz"] .library-more')).opacity==='1');
  check('a click selects a card and keeps its menu button visible',await page.locator('[data-library-path="Walker.stkz"][aria-selected="true"]').count()===1);
  await page.keyboard.press('ArrowRight');
  check('arrow keys move the selection',await page.evaluate(()=>rigs.library.selected)==='Punch.rigsmov');
  await page.locator('[data-library-path="Walker.stkz"] .library-more').click();
  const menu=page.getByRole('menu',{name:'Library actions'});
  check('the card menu holds every card action',await menu.isVisible()&&await labels(menu)==='Insert|Rename|Move to…|Show in folder|Move to Recycle Bin');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Library options',exact:true}).click();
  const options=page.getByRole('menu',{name:'Library options'});
  check('the library menu holds folders, refresh, the preview background and examples',(await labels(options)).startsWith('New folder|Add selection|Refresh|Show in folder|Preview background')&&await options.locator('[data-action="rig-examples"]').count()===1);
  await options.getByRole('menuitem',{name:'Preview background'}).click();
  await page.getByRole('menuitemradio',{name:'Dark'}).click();
  check('the preview background override applies',await page.locator('#user-library').getAttribute('data-background')==='dark');
  check('Add selection is pinned to the foot',await page.locator('.library-foot .library-add').isVisible());
  await page.evaluate(()=>rigs.library.refresh('Characters'));
  check('an empty folder offers next steps',await page.getByText('Empty folder').isVisible()&&await page.locator('.library-breadcrumbs [aria-current="location"]').textContent()==='Characters');
  await page.locator('.library-breadcrumbs button').first().click();

  check('the Library has no horizontal overflow',await page.locator('#user-library').evaluate(node=>node.scrollWidth<=node.clientWidth));
  check('no uncaught browser errors',!errors.length);
}finally{await browser.close();}
if(errors.length)console.error(errors.join('\n'));
