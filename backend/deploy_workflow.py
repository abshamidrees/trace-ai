import os
from dotenv import load_dotenv
import opengradient as og

load_dotenv()

private_key = os.getenv("OG_PRIVATE_KEY")
rpc_url = os.getenv("OG_RPC_URL", "https://rpc.opengradient.ai")

if not private_key:
    print("❌ OG_PRIVATE_KEY missing in .env")
    exit(1)

print("🔗 Connecting to OpenGradient...")

alpha = og.Alpha(private_key=private_key, rpc_url=rpc_url)

print("🚀 Deploying real TEE LLM workflow...")

# Use a known public model CID (from docs/examples)
model_cid = "QmRhcpDXfYCKsimTmJYrAVM4Bbvck59Zb2onj3MHv9Kw5N"  # Llama-3.1-8B example

workflow = alpha.deploy_llm(
    model_cid=model_cid,
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
""",
    mode="tee"
)

print("\n✅ Real TEE Workflow deployed!")
print("Contract address:", workflow.address)
print("\nAdd this to your .env:")
print(f"OG_WORKFLOW_ADDRESS={workflow.address}")