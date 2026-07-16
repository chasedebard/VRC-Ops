/**
 * Importing this module registers every tile type (each file calls
 * registerTile() as a load-time side effect). Import this once, before
 * anything reads the registry (getTileDefinition/listTileDefinitions) or
 * computes a default layout.
 */
import './DriverProfileTile'
import './CareerStatisticsTile'
import './SeasonStatisticsTile'
import './RecentPerformanceTile'
import './ClosestRivalTile'
import './UpcomingRaceTile'
import './LastRaceTile'
import './RaceWeekendStatusTile'
import './PracticePerformanceTile'
import './ChampionshipStandingsTile'
import './TeamStandingsTile'
import './ChampionshipPositionSummaryTile'
import './PointsTrendTile'
import './PositionTrendTile'
import './RaceResultTrendTile'
import './QualifyingVsRaceTile'
import './PredictionAnalysisTile'
import './DriverComparisonWrapperTile'
import './RequiredActionsTile'
import './LeagueAnnouncementsTile'
import './SeasonProgressTile'
import './PersonalBestsTile'
import './TrackPerformanceTile'
import './ParticipationTile'
import './AdministrationSummaryTile'
import './LeagueOverviewTile'
import './SubscriptionSummaryTile'
