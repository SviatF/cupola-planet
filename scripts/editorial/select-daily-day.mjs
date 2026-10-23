import {appendFileSync} from "node:fs";
import {selectDailyEditorialDay} from "../../lib/editorial/selectDailyDay.mjs";
const decision=selectDailyEditorialDay(process.env.REQUESTED_DAY,new Date());
const reason=decision.reason==="day-incomplete"
 ? "Requested UTC date is still ongoing. Rerun after "+decision.notBefore+" or leave the date blank to use the previous UTC date."
 : decision.reason==="source-window-expired"
 ? "Historical day is outside rolling feed retention. Verified archived snapshots are required before backfill."
 : "Complete UTC date selected. Science facts will be collected and checked.";
const message="CUPOLA Daily Earth: "+decision.day+": "+reason;
console.log(message);
if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,
 "day="+decision.day+"\nready="+String(decision.ready)+"\nreason="+(decision.reason||"ready")+"\n");
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
 "### CUPOLA Daily Earth editorial preflight\n"+
 "- Requested/selected UTC day: **"+decision.day+"**\n"+
 "- Status: **"+(decision.ready?"READY":"NOT READY — NO DRAFT CREATED")+"**\n"+
 "- "+reason+"\n"+
 "- Unpublished fact-ledger drafts only; not an indexed SEO page.\n");
