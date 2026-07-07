# Manual Evaluation Procedure

This document describes how to manually evaluate the Bullshit Detector's accuracy.

## Before you start

1. Deploy the search proxy (for Brave Search API integration)
2. Open the site in Chrome or Edge on desktop
3. Ensure the model is loaded (or use a cached model)

## Running the evaluation

For each entry in `test/fixtures/eval-claims.json`:

1. Paste the claim text into the input box
2. Click "Detect Bullshit"
3. Wait for claims to be extracted (should find 1 claim)
4. Click "Sniff 1 claims"
5. Wait for verification to complete
6. Record the verdict (Fresh/Bullshit/Smelly) and compare to expected

The claim is considered correctly classified if:
- Expected "Fresh" and got "Fresh" → correct
- Expected "Bullshit" and got "Bullshit" → correct
- Expected "Fresh" or "Bullshit" and got "Smelly" → incorrect (false negative)
- Expected "Bullshit" and got "Fresh" → incorrect (false positive)

## Results table

| # | Claim | Expected | Verdict | Notes |
|---|-------|----------|---------|-------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |
| 11 | | | | |
| 12 | | | | |
| 13 | | | | |
| 14 | | | | |
| 15 | | | | |

**Target: ≥70% agreement (11 of 15 claims)**

## Tips

- Try the "Full Autopsy" model tier for more reliable results
- If search fails, check the proxy is deployed
- Results may vary based on real-time search results and model output