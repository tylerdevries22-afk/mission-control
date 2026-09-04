'use client'

import type { ClaudeFleetPlanStatus } from '@/lib/claude-fleet-plans'
import { claudeFleetPlanTotalUsd, formatClaudeFleetLabels } from '@/lib/claude-fleet-plans'

export function CostFleetPlans({ plans }: { plans: ClaudeFleetPlanStatus[] }) {
  const total = plans.length ? plans.reduce((sum, plan) => sum + plan.priceUsd, 0) : claudeFleetPlanTotalUsd()

  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{formatClaudeFleetLabels()}</h2>
          <p className="text-sm text-muted-foreground">
            Two Claude Max plans — personal 20x and Stillpoint 5x — not one max.
          </p>
        </div>
        <div className="text-2xl font-bold text-foreground">${total}/mo</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {plans.map((plan) => (
          <article key={plan.identity} className="rounded-md border border-border/80 p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">{plan.label}</span>
              <span className="text-sm text-muted-foreground">${plan.priceUsd}/mo</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {plan.identity} · {plan.account}
            </p>
            <p className="text-xs">
              {plan.authStatus === 'isolated'
                ? `Isolated home ready: ${plan.isolatedHome}`
                : `Needs one-time CLAUDE_CONFIG_DIR=${plan.isolatedHome} claude auth login. Heal will not create this directory or copy oauthAccount.`}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}
