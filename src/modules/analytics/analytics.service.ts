import { Types } from 'mongoose';
import { CandidateProfile } from '@/modules/candidate/candidate.model';
import { EmployerProfile } from '@/modules/employer/employer.model';
import { Job } from '@/modules/job/job.model';
import { User } from '@/modules/user/user.model';
import { SearchEvent } from './searchEvents.model';

const CACHE_TTL_MS = 60_000;

type CacheEntry<T> = { expiresAt: number; value: T };

const cache = new Map<string, CacheEntry<unknown>>();

// Only for trend data. Counters an admin just changed (pending offers, verified
// profiles) are read uncached, or the dashboard contradicts the action for a minute.
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }

  const value = await fn();
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayBefore(days: number, from = new Date()): Date {
  return new Date(from.getTime() - days * 86400000);
}

function monthBuckets(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
}

export type DashboardStats = {
  candidates: number;
  employers: number;
  activeJobs: number;
  pendingJobs: number;
};

export async function getStats(): Promise<DashboardStats> {
  const [candidates, employers, activeJobs, pendingJobs] = await Promise.all([
    CandidateProfile.countDocuments({ deletedAt: null }),
    EmployerProfile.countDocuments({ deletedAt: null }),
    Job.countDocuments({ status: 'active', deletedAt: null }),
    Job.countDocuments({ status: 'pending', deletedAt: null }),
  ]);

  return { candidates, employers, activeJobs, pendingJobs };
}

export type GrowthBucket = { month: string; count: number };

export async function getGrowth(
  year: number,
  metric: 'cooks' | 'restaurants',
): Promise<GrowthBucket[]> {
  const cacheKey = `dashboard:growth:${year}:${metric}`;
  return cached(cacheKey, async () => {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    if (metric === 'cooks') {
      const rows = await User.aggregate([
        {
          $match: {
            role: 'candidate',
            createdAt: { $gte: start, $lt: end },
            deletedAt: null,
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%m', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
      ]);

      const counts = Object.fromEntries(rows.map((row: any) => [row._id, row.count]));
      return monthBuckets(year).map((month) => ({
        month,
        count: counts[month] ?? 0,
      }));
    }

    const rows = await EmployerProfile.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lt: end },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%m', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = Object.fromEntries(rows.map((row: any) => [row._id, row.count]));
    return monthBuckets(year).map((month) => ({
      month,
      count: counts[month] ?? 0,
    }));
  });
}

export type MarketPosition = { id: string; count: number };
export type MarketCity = { id: string; count: number };

export type MarketData = {
  searchedPositions: MarketPosition[];
  searchedCities: MarketCity[];
  averageSalary: number;
};

export async function getMarket(): Promise<MarketData> {
  return cached('dashboard:market', async () => {
    const [positions, cities, salaryAgg] = await Promise.all([
      SearchEvent.aggregate<{ _id: string; count: number }>([
        { $match: { 'filters.positionId': { $exists: true, $ne: '' } } },
        { $group: { _id: '$filters.positionId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
      SearchEvent.aggregate<{ _id: string; count: number }>([
        { $match: { 'filters.city': { $exists: true, $ne: '' } } },
        { $group: { _id: '$filters.city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
      Job.aggregate([
        {
          $match: {
            status: 'active',
            deletedAt: null,
            salaryMin: { $ne: null },
            salaryMax: { $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            avgSalary: { $avg: { $divide: [{ $add: ['$salaryMin', '$salaryMax'] }, 2] } },
          },
        },
      ]),
    ]);

    return {
      searchedPositions: positions.map((row: any) => ({ id: row._id, count: row.count })),
      searchedCities: cities.map((row: any) => ({ id: row._id, count: row.count })),
      averageSalary: Math.round(salaryAgg[0]?.avgSalary ?? 0),
    };
  });
}

export type DayCount = { day: string; count: number };
export type MonthCount = { month: string; count: number };
export type IdCount = { id: string; count: number };

export type StatisticsData = {
  days: number;
  candidatesPerDay: DayCount[];
  employersPerDay: DayCount[];
  employersPerMonth: MonthCount[];
  candidatesByPosition: IdCount[];
  employersByType: IdCount[];
  candidates: Record<string, number>;
  employers: Record<string, number | Record<string, number>>;
  offers: Record<string, number>;
};

export async function getStatistics(days = 30): Promise<StatisticsData> {
  const safeDays = Math.min(Math.max(1, days), 365);

  const now = new Date();
  const rangeStart = dayBefore(safeDays - 1, now);
  rangeStart.setUTCHours(0, 0, 0, 0);

  const year = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [candidateProfiles, employerProfiles, jobs, positionsAgg, typesAgg] = await Promise.all([
    CandidateProfile.find({ createdAt: { $gte: rangeStart }, deletedAt: null })
      .select('createdAt positionId verified completionPercent availability')
      .lean() as Promise<any[]>,
    EmployerProfile.find({ createdAt: { $gte: rangeStart }, deletedAt: null })
      .select('createdAt type status verified')
      .lean() as Promise<any[]>,
    Job.find({ deletedAt: null })
      .select('status postedAt expiresAt reportCount')
      .lean() as Promise<any[]>,
    CandidateProfile.aggregate([
      { $match: { deletedAt: null, positionId: { $ne: '' } } },
      { $group: { _id: '$positionId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    EmployerProfile.aggregate([
      { $match: { deletedAt: null, type: { $ne: '' } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const countPerDay = (dates: Date[]): DayCount[] => {
    const counts: Record<string, number> = {};
    for (const date of dates) {
      const day = isoDay(new Date(date));
      counts[day] = (counts[day] ?? 0) + 1;
    }

    return Array.from({ length: safeDays }, (_, i) => {
      const day = isoDay(dayBefore(safeDays - 1 - i, now));
      return { day, count: counts[day] ?? 0 };
    });
  };

  const employersInYear: any[] = await EmployerProfile.find({
    createdAt: { $gte: yearStart, $lt: yearEnd },
    deletedAt: null,
  })
    .select('createdAt')
    .lean();

  const monthCounts: Record<string, number> = {};
  for (const profile of employersInYear) {
    const month = String(new Date(profile.createdAt).getUTCMonth() + 1).padStart(2, '0');
    monthCounts[month] = (monthCounts[month] ?? 0) + 1;
  }

  const allCandidates: any[] = await CandidateProfile.find({ deletedAt: null })
    .select('verified completionPercent availability createdAt')
    .lean();
  const allEmployers: any[] = await EmployerProfile.find({ deletedAt: null })
    .select('verified status type')
    .lean();

  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const weekStart = dayBefore(7, now);
  const monthStart = dayBefore(30, now);

  const candidateStats = {
    total: allCandidates.length,
    newToday: allCandidates.filter((c) => new Date(c.createdAt) >= todayStart).length,
    newThisWeek: allCandidates.filter((c) => new Date(c.createdAt) >= weekStart).length,
    newThisMonth: allCandidates.filter((c) => new Date(c.createdAt) >= monthStart).length,
    active: allCandidates.filter((c) => c.verified).length,
    complete: allCandidates.filter((c) => c.completionPercent === 100).length,
    verified: allCandidates.filter((c) => c.verified).length,
    availableNow: allCandidates.filter((c) => c.availability === 'immediate').length,
  };

  const employerStats = {
    total: allEmployers.length,
    verified: allEmployers.filter((e) => e.verified).length,
    pending: allEmployers.filter((e) => e.status === 'pending').length,
    blocked: allEmployers.filter((e) => e.status === 'blocked').length,
    active: allEmployers.filter((e) => e.status === 'active').length,
    byType: allEmployers.reduce<Record<string, number>>((acc, employer) => {
      if (employer.type) {
        acc[employer.type] = (acc[employer.type] ?? 0) + 1;
      }
      return acc;
    }, {}),
  };

  const nowMs = now.getTime();
  const offerStats = {
    active: jobs.filter((j) => j.status === 'active').length,
    postedToday: jobs.filter((j) => j.postedAt && new Date(j.postedAt) >= todayStart).length,
    postedThisMonth: jobs.filter((j) => j.postedAt && new Date(j.postedAt) >= monthStart).length,
    expiringSoon: jobs.filter((j) => {
      if (j.status !== 'active' || !j.expiresAt) return false;
      const left = Math.ceil((new Date(j.expiresAt).getTime() - nowMs) / 86400000);
      return left > 0 && left <= 7;
    }).length,
    expired: jobs.filter((j) => j.status === 'expired').length,
    closed: jobs.filter((j) => j.status === 'closed').length,
    rejected: jobs.filter((j) => j.status === 'rejected').length,
    pendingApproval: jobs.filter((j) => j.status === 'pending').length,
    reported: jobs.reduce((sum: number, j: any) => sum + (j.reportCount ?? 0), 0),
  };

  return {
    days: safeDays,
    candidatesPerDay: countPerDay(candidateProfiles.map((c) => c.createdAt)),
    employersPerDay: countPerDay(employerProfiles.map((e) => e.createdAt)),
    employersPerMonth: monthBuckets(year).map((month) => ({
      month,
      count: monthCounts[month] ?? 0,
    })),
    candidatesByPosition: positionsAgg.map((row: any) => ({
      id: row._id,
      count: row.count,
    })),
    employersByType: typesAgg.map((row: any) => ({ id: row._id, count: row.count })),
    candidates: candidateStats,
    employers: employerStats,
    offers: offerStats,
  };
}

export async function recordSearchEvent(input: {
  kind: 'job-search' | 'candidate-search';
  term?: string;
  filters?: Record<string, unknown>;
  userId?: string | null;
  resultCount?: number;
}): Promise<void> {
  await SearchEvent.create({
    kind: input.kind,
    term: input.term?.trim() ?? '',
    filters: input.filters ?? {},
    userId: input.userId ? new Types.ObjectId(input.userId) : null,
    resultCount: input.resultCount ?? 0,
  });
}

export async function recordProfileView(
  profileId: string,
  viewerUserId?: string | null,
): Promise<void> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const filter: Record<string, unknown> = {
    profileId: new Types.ObjectId(profileId),
    createdAt: { $gte: startOfDay },
  };

  if (viewerUserId) {
    filter.viewerUserId = new Types.ObjectId(viewerUserId);
  } else {
    filter.viewerUserId = null;
  }

  const { ProfileView } = await import('./profileViews.model');
  const existing = await ProfileView.findOne(filter);
  if (existing) return;

  await ProfileView.create({
    profileId: new Types.ObjectId(profileId),
    viewerUserId: viewerUserId ? new Types.ObjectId(viewerUserId) : null,
  });
}
