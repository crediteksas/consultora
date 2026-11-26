from pathlib import Path
import shutil,json,hashlib
r=Path(__file__).resolve().parent
for n in ['nova','clientes']:shutil.copytree(r/'baseline'/n,r/'candidate'/n,dirs_exist_ok=True)
p=r/'candidate/nova/index.mjs';s=p.read_text()
def one(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a));s=s.replace(a,b)
one('        zero = true;\n        continue;', '        zero = true;')
one('let successful = 0, zero = false;','let successful = 0, zero = false;\n  const restrictiveReasons = [];')
one('    if (!Array.isArray(o.obligations)) continue;','    if (o.bindingVerified === true && count(o.confirmedOverdueInstallments) && o.confirmedOverdueInstallments > 2) restrictiveReasons.push("more_than_two_overdue");\n    if (!Array.isArray(o.obligations)) continue;')
one('      if (c?.active !== true || typeof c.id !== "string" || !c.id || !count(c.paidInstallments) || !count(c.overdueInstallments)) {','      if (c?.active === true && typeof c.id === "string" && c.id && count(c.overdueInstallments) && c.overdueInstallments > 2) {\n        restrictiveReasons.push("more_than_two_overdue");\n        continue;\n      }\n      if (c?.active !== true || typeof c.id !== "string" || !c.id || !count(c.paidInstallments) || !count(c.overdueInstallments)) {')
one('      if (c.overdueInstallments > 2) reasons3.push("more_than_two_overdue");\n      else if (c.overdueInstallments > 0 && c.paidInstallments < 4) reasons3.push("overdue_with_less_than_four_paid");','      if (c.overdueInstallments > 0 && c.paidInstallments < 4) restrictiveReasons.push("overdue_with_less_than_four_paid");')
one('  if (zero) return result("rejected", ["zero_payments"], { successfulPlatforms: successful, overrideAllowed: false });','  if (zero) restrictiveReasons.unshift("zero_payments");\n  if (restrictiveReasons.length) return result("rejected", restrictiveReasons, { successfulPlatforms: successful, overrideAllowed: false, restrictionRuleVersion: "retail-restrictions-20261125-v1" });')
one(' const valid=noActive||verified;',' const valid=noActive||verified;\n // Restrictive-only evidence: never invent obligations, paid counts or complete history.\n const confirmedOverdueInstallments=verified&&fresh&&o.platform===job.platform&&job.platform===\'KREDIYA\'&&classifyKrediyaAccount({platform:job.platform,status:job.status,observation:o,reason:job.reason_code})?.code===\'active_arrears\'?o.overdueInstallments:null;')
one('reason:job.reason_code,bindingVerified:bound,confirmedPhoneNoMatch,','reason:job.reason_code,bindingVerified:bound,confirmedOverdueInstallments,confirmedPhoneNoMatch,')
one('// Presentation of existing case state only. No lending decisions or financial thresholds.\n// Describes provider evidence. Does not determine lending eligibility.\nfunction classifyKrediyaAccount(', '// Normalizes provider statements; active_arrears also supplies restrictive-only evidence.\n// Threshold decisions remain in evaluatePlatforms.\nfunction classifyKrediyaAccount(')
p.write_text(s)
manifest={stage:{'creditek-'+n:{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in (r/stage/n).iterdir()} for n in ['nova','clientes']} for stage in ['baseline','candidate']}
(r/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Built scoped restriction-rule patch')
