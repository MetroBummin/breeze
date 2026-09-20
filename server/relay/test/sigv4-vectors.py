"""Optional regeneration: Python + botocore 1.43.18. Entirely fake credentials; no network."""
import datetime, json
from pathlib import Path
from unittest.mock import patch
from botocore.auth import S3SigV4QueryAuth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials
vectors=[]
at=datetime.datetime(2026,9,20,4,0,0,tzinfo=datetime.timezone.utc)
endpoint='https://00000000000000000000000000000000.r2.cloudflarestorage.com'
for method,key,headers in [
 ('PUT','relay/test/stage',{'content-type':'application/octet-stream','content-length':'64','if-none-match':'*'}),
 ('GET','relay/test/ready',{'if-match':'"dummy-etag"'}),
 ('PUT','relay/test/ready',{'x-amz-copy-source':'/breeze-book-relay-dev/relay/test/stage','x-amz-copy-source-if-match':'"dummy-etag"','x-amz-metadata-directive':'REPLACE','content-type':'application/octet-stream','cache-control':'private, no-store'})]:
    args=dict(endpoint=endpoint,bucket='breeze-book-relay-dev',key=key,method=method,headers=headers,accessKey='TEST_ONLY_ACCESS',secretKey='TEST_ONLY_SECRET',at=int(at.timestamp()*1000),seconds=60)
    req=AWSRequest(method=method,url=endpoint+'/breeze-book-relay-dev/'+key,headers=headers)
    with patch('botocore.auth.get_current_datetime',return_value=at):
        S3SigV4QueryAuth(Credentials(args['accessKey'],args['secretKey']),'s3','auto',expires=60).add_auth(req)
    vectors.append({'input':args,'url':req.url})
Path(__file__).with_name('sigv4-vectors.json').write_text(json.dumps(vectors,indent=2)+'\n')
