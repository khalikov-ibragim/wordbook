set -e
python3 -c "
import os, urllib.request
domain = 'mywordbook'
token = os.environ['DUCKDNS_TOKEN']
txt = os.environ['CERTBOT_VALIDATION']
url = f'https://www.duckdns.org/update?domains={domain}&token={token}&txt={txt}'
urllib.request.urlopen(url)
"
sleep 30
