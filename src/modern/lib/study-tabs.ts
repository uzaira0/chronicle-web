import {
  ClipboardList,
  Clock3,
  FileArchive,
  History,
  ScrollText,
  Shield,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import type { StudyModule } from '@/lib/study-constants';

export const allStudyTabs: ReadonlyArray<{
  icon: typeof ClipboardList;
  labelKey: string;
  module: StudyModule | null;
  to: string;
}> = [
  { icon: ClipboardList, labelKey: 'study_layout.tab_overview', module: null, to: '' },
  { icon: Users, labelKey: 'study_layout.tab_participants', module: null, to: 'participants' },
  {
    icon: SlidersHorizontal,
    labelKey: 'study_layout.tab_preprocessing',
    module: 'CHRONICLE_DATA_COLLECTION',
    to: 'preprocessing',
  },
  { icon: FileArchive, labelKey: 'study_layout.tab_downloads', module: null, to: 'downloads' },
  { icon: ScrollText, labelKey: 'study_layout.tab_questionnaires', module: 'CHRONICLE_SURVEYS', to: 'questionnaires' },
  { icon: Shield, labelKey: 'study_layout.tab_compliance', module: null, to: 'compliance' },
  { icon: Clock3, labelKey: 'study_layout.tab_tud', module: 'TIME_USE_DIARY', to: 'time-use-diary' },
  { icon: History, labelKey: 'study_layout.tab_audit', module: null, to: 'audit' },
];
