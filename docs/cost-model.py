"""Planning estimates, USD, us-central1; not Google billing measurements.
Run from the repository root: python docs/cost-model.py
Rates checked 2026-09-29. Free allowances are applied ONCE to the shared project/account.
"""
import json
from pathlib import Path

def estimate(warehouses, month, free=True, seconds=1.0):
    n=warehouses
    allowance=lambda value: value if free else 0
    db_gib=.2*month*n # conservative end-of-month storage incl. indexes/receipts
    photo_gib=1000*(512+24)*1024/(1024**3)*month*n
    invocations=20000*n
    cpu_seconds=invocations*seconds*1.2 # 20% startup/retry planning margin
    assessments=3520*n
    recaptcha=0 if assessments<=allowance(10000) else (8+max(0,assessments-100000)/1000 if free else 8+max(0,assessments-90000)/1000)
    costs={
      'firestore_operations':max(0,750000*n-allowance(50000*22))*.03/100000+max(0,70000*n-allowance(20000*22))*.09/100000,
      'firestore_storage':max(0,db_gib-allowance(1))*.15,
      'seven_daily_database_backups':db_gib*7*.03,
      'photos_backup_and_build_source_storage':max(0,2*photo_gib+1-allowance(5))*.02,
      'photo_operations_including_backup':max(0,4000*n-allowance(5000))*.005/1000+max(0,16000*n-allowance(50000))*.0004/1000,
      'photo_downloads':max(0,(2000*512+10000*24)*1024/(1024**3)*n-allowance(100))*.12,
      'database_downloads':max(0,2*n-allowance(10))*.12,
      'cloud_run_functions':max(0,cpu_seconds-allowance(180000))*.000024+max(0,cpu_seconds*.25-allowance(360000))*.0000025+max(0,invocations-allowance(2000000))*.40/1000000,
      'app_check_assessments':recaptcha,
      'artifact_registry':max(0,5-allowance(.5))*.10,
      'cloud_build':max(0,108-allowance(2500))*.006,
      'daily_cleanup_scheduler':0 if free else .10,
      'orphan_soft_delete_storage_reserve':.01*n,
    }
    return {'warehouses':n,'month':month,'monthly_revenue':29*n,'costs':{k:round(v,4)for k,v in costs.items()},'total':round(sum(costs.values()),2),'database_gib':round(db_gib,3),'photo_gib_each_primary_and_backup':round(photo_gib,3),'reads':750000*n,'writes':70000*n,'function_requests':invocations,'assessments':assessments}

result={'assumptions':'22 working days; all warehouses share a project and billing account; figures are estimates, not caps','normal':[estimate(n,m)for m in [1,12]for n in [1,10,50]],'runtime_sensitivity_year12':[{'warehouses':n,'low_0_2s':estimate(n,12,seconds=.2)['total'],'high_1_5s':estimate(n,12,seconds=1.5)['total']}for n in [1,10,50]],'without_free_allowances_year12':[estimate(n,12,free=False)for n in [1,10,50]]}
Path('docs/measurements').mkdir(exist_ok=True)
Path('docs/measurements/cost-estimates.json').write_text(json.dumps(result,indent=2)+'\n')
for row in result['normal']:print(row['warehouses'],row['month'],row['total'])
