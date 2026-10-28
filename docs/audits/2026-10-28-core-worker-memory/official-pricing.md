# Wave278 official Fly command-worker pricing

## Finding

For the requested4 performance CPUs,16384MiB and iad, current official numeric data yields **$0.2500416/hour** ($0.000069456/second). Mission Control's1800s timeout plus300s reservation margin costs **$0.1458576**, below the unchanged$0.25 per-job compute cap by$0.1041424. This is a compute estimate, not an invoice or activation/commissioning proof.

## Official evidence and reproducible calculation

The [current resource-pricing page](https://docs.fly.io/about/pricing) HTML embeds the precise constants and formula captured below. Its region table maps iad to Ashburn with markup1. The calculation is:

4 ×0.000012732 + (16 −4 ×2) ×0.000002316 =0.000069456 USD/second.

Multiply by3600 for hourly price, or2100 for this reservation. The performance coefficient includes2GB per CPU; do not add all16GB again. Official ramGB converts MB by1024, so16384MiB corresponds to16 in this formula.

[Current public pricing](https://fly.io/pricing/) independently embeds base4CPU8GB hourly0.1833408 and additional-RAM30-day rate6.003072/GB. Adding8GB yields the same hourly result. The [October1,2026 update](https://fly.io/pricing-update/) establishes the effective change: additional RAM is now displayed at$6/GB/month while CPU pricing is unchanged. The table's rounded$0.1833 and rounded$6.00 must not replace the precise underlying values for reservation arithmetic.

## Documentation drift

The web extraction/search cache still returned older$5/GB prose and older tables. A direct public, unauthenticated HTML read of the current official documentation contains RAM_PRICE_PER_GB_SECOND=2316e-9 and current coefficients, agreeing with current public pricing. Prefer these captured current values over cached text. Only public documentation/page HTML was fetched; no authenticated provider API, flyctl, billing query or Machine operation was used.

## Billing dimensions and local contract

Machines charge provisioned CPU/RAM by elapsed started seconds, not actual CPU utilization or resident memory. Public pricing lists stopped rootfs storage separately at$0.15/GB-month, provisioned volumes$0.15/GB-month, snapshots$0.08/GB-month and North-America/Europe egress$0.02/GB. Those dimensions, image builds and inference are outside this compute reservation; any account-specific credit/discount/tax/invoice adjustment remains unknown. No discount assumed.

Inspected local src/lib/fly-pricing.ts reserves rate ×(timeout_seconds+300)/3600 and rejects a reservation above MC_FLY_PER_JOB_BUDGET_USD. docs/fly-agent-workers.md explicitly calls this a compute estimate and excludes storage/egress/image/inference. Existing8192MiB fallback doubles the2CPU4GB rate; it must not be silently reused to price16GB. No source/config change made here. Preserve authorized monthly$65.50, daily$3, per-job$0.25 and shared25-worker cap. Pricing research does not commission the new class or replace resource/provider/image validation.

## Captured underlying numeric data

```json
{
  "capturedAt": "2026-10-28T20:34:57.476Z",
  "sourceUrls": [
    "https://fly.io/pricing/",
    "https://fly.io/pricing-update/",
    "https://docs.fly.io/about/pricing"
  ],
  "currentPricingHtmlSha256": "6ffeb437b8012e06cdbeeccf55df3ef12688e92f2fdb46bb3dcf62c7e7e2aa22",
  "currentDocsHtmlSha256": "97cc03e4f7781166a6037b5c0188096299def8099195735c403c60791d0e1bf3",
  "officialEmbeddedData": {
    "iad": {
      "city": "Ashburn, Virginia (US)",
      "markup": 1
    },
    "PRICE_PER_VCPU_SECOND": {
      "shared": 8.465e-7,
      "performance": 0.000012732
    },
    "INCLUDED_RAM_GB_PER_VCPU": {
      "shared": 0.25,
      "performance": 2
    },
    "RAM_PRICE_PER_GB_SECOND": 0.000002316,
    "SECONDS_PER_HOUR": 3600,
    "SECONDS_PER_MONTH": 2592000
  },
  "independentPricingHtmlAttributes": {
    "performance4x8gbHourly": 0.1833408,
    "performance4x8gbMonthly": 132.005376,
    "additionalRamGbMonthly": 6.003072
  },
  "requestedShape": {
    "cpuKind": "performance",
    "cpus": 4,
    "memoryMiB": 16384,
    "ramGbInOfficialFormula": 16
  },
  "calculation": {
    "perSecond": 0.000069456,
    "perHour": 0.2500416,
    "per30days": 180.029952,
    "ttlSeconds": 2100,
    "reservationUsd": 0.1458576,
    "perJobCapUsd": 0.25,
    "remainingPerJobHeadroomUsd": 0.1041424
  }
}
```
