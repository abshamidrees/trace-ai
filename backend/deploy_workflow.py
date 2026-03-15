import os
from dotenv import load_dotenv
import opengradient as og

load_dotenv()

private_key = os.getenv("OG_PRIVATE_KEY")
rpc_url = os.getenv("OG_RPC_URL", "https://rpc.opengradient.ai")

if not private_key:
    print("❌ ERROR: OG_PRIVATE_KEY missing in .env")
    exit(1)

print("🔗 Connecting to OpenGradient...")

# Deploy TEE LLM workflow (current SDK API)
workflow = og.TEE_LLM(
    model="meta-llama/Llama-3.1-8B-Instruct",
    name="trace-ai-sybil-detector",
    system_prompt="""You are a blockchain forensics AI specialising in Sybil detection.
Analyse the wallet transaction data provided and return ONLY a valid JSON object with this exact shape:

{
  "risk_score": <integer 0-100>,
  "risk_level": "<high|medium|low>",
  "sybil_probability": <float 0.0-1.0>,
  "explanation": "natural language explanation",
  "signals": [
    {"label": "signal name", "severity": "high|medium|low", "description": "what was detected"}
  ]
}
"""
).deploy()

print("\n✅ TEE Workflow deployed successfully!")
print("Contract address:", workflow.contract_address)
print("\nCopy this address and add it to your root .env file:")
print(f"OG_WORKFLOW_ADDRESS={workflow.contract_address}")