import { MergedCandidate } from '../domain/candidate';
import { IFilterRule, FilterContext } from '../domain/filter-rule';
import { baseLogger } from '../infrastructure/logging/logger';

export { FilterContext } from '../domain/filter-rule';

export interface FilterResult {
  candidates: MergedCandidate[];
  totalBefore: number;
  totalAfter: number;
  filteredOutCount: number;
}

export class BusinessFilterEngine {
  private rules: IFilterRule[];

  constructor(rules: IFilterRule[] = []) {
    this.rules = rules;
  }

  public addRule(rule: IFilterRule): void {
    this.rules.push(rule);
  }

  public filter(candidates: MergedCandidate[], context: FilterContext): FilterResult {
    const totalBefore = candidates.length;

    const survivingCandidates = candidates.filter((candidate) => {
      for (const rule of this.rules) {
        if (!rule.evaluate(candidate, context)) {
          return false;
        }
      }
      return true;
    });

    const totalAfter = survivingCandidates.length;
    const filteredOutCount = totalBefore - totalAfter;

    baseLogger.info(
      {
        // Sem userId: identificador do cliente fica fora do log (lista permitida, T085).
        totalBefore,
        totalAfter,
        filteredOutCount,
      },
      'Business filtering completed' // contagens nos campos totalBefore, totalAfter e filteredOutCount
    );

    return {
      candidates: survivingCandidates,
      totalBefore,
      totalAfter,
      filteredOutCount,
    };
  }
}
