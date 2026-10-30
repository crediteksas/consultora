import {spawnSync} from 'node:child_process';

// Test-only adapter: every statement reaches the named LOCAL disposable Docker
// container through docker exec, never TCP or a remote database connection.
export class NativePostgres {
  constructor(container){
    if(!/^nova-flow-sql-[a-zA-Z0-9-]+$/.test(container))throw Error('INVALID_TEST_CONTAINER');
    this.container=container;this.role=null;
  }
  run(sql){
    const prefix=this.role?'set role '+this.role+';\n':'';
    const result=spawnSync('docker',['--context','colima','exec','-i',this.container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:prefix+sql,encoding:'utf8'});
    if(result.status!==0)throw Error((result.stderr||result.error?.message||'native-test-query-failed').trim());
    return result.stdout.trim();
  }
  async exec(sql){
    if(/^set role (service_role|anon|authenticated)$/.test(sql)){this.role=sql.slice(9);return [];}
    if(sql==='reset role'){this.role=null;return [];}
    this.run(sql);return [];
  }
  async query(sql,params=[]){
    const literal=v=>v===null?'null':Array.isArray(v)?'ARRAY['+v.map(literal).join(',')+']':typeof v==='number'?String(v):typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replace(/'/g,"''")+"'";
    const bound=sql.replace(/\$(\d+)/g,(_,n)=>{if(Number(n)>params.length)throw Error('MISSING_TEST_PARAMETER');return literal(params[Number(n)-1]);}).replace(/;\s*$/,'');
    if(/^\s*(select|with)\b/i.test(bound))return {rows:JSON.parse(this.run('select coalesce(json_agg(result),\'[]\'::json) from ('+bound+') result;'))};
    this.run(bound);return {rows:[]};
  }
  async close(){}
}
