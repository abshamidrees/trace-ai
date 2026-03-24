import opengradient as og
import os
from dotenv import load_dotenv

load_dotenv('.env')

private_key = os.getenv('OG_PRIVATE_KEY')
if not private_key or private_key.startswith("0xYOUR_PRIVATE_KEY"):
    print("❌ ERROR: Put your real OG_PRIVATE_KEY in .env first!")
else:
    print("🔄 Connecting to OpenGradient...")
    llm = og.LLM(private_key=private_key)
    print("⏳ Running OPG approval (this takes 10-20 seconds)...")
    try:
        result = llm.ensure_opg_approval(opg_amount=5)
        tx = getattr(result, 'tx_hash', None)
        print('✅ SUCCESS! Approval transaction:', tx if tx else 'Already approved')
    except Exception as e:
        print('❌ Error:', str(e))