import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout'
import { BrandSuggestionsPage, CompetitorsPage } from '@/pages/brand'
import { CalendarPage } from '@/pages/calendar'
import { DashboardPage } from '@/pages/dashboard'
import { DataPage } from '@/pages/data'
import { ImportPage } from '@/pages/import'
import { LeadSuggestionsPage, LeadsLogPage, PipelinePage } from '@/pages/leads'
import { LinkedInPage } from '@/pages/linkedin'
import { NewPostPage } from '@/pages/post-new'
import { PostDetailPage } from '@/pages/post-detail'
import { ProfilePage } from '@/pages/profile'
import { CreatePostPage } from '@/pages/create-post'
import { PublishingPage } from '@/pages/publishing'
import { SettingsPage } from '@/pages/settings'
import { SignInPage } from '@/pages/signin'
import { SuggestionsPage } from '@/pages/suggestions'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="signin" element={<SignInPage />} />
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="data" element={<DataPage />} />
          <Route path="posts" element={<Navigate to="/data?tab=posts" replace />} />
          <Route path="posts/new" element={<NewPostPage />} />
          <Route path="posts/:id" element={<PostDetailPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="create" element={<CreatePostPage />} />
          <Route path="create/:id" element={<CreatePostPage />} />
          <Route path="publishing" element={<PublishingPage />} />
          <Route path="audience" element={<Navigate to="/data?tab=audience" replace />} />
          <Route path="brand" element={<Navigate to="/brand/suggestions" replace />} />
          <Route path="brand/suggestions" element={<BrandSuggestionsPage />} />
          <Route path="brand/kit" element={<Navigate to="/settings?tab=claude" replace />} />
          {/* The page checklist became Brand suggestions that show until each item is done */}
          <Route path="brand/checklist" element={<Navigate to="/brand/suggestions" replace />} />
          <Route path="brand/competitors" element={<CompetitorsPage />} />
          <Route path="leads" element={<Navigate to="/leads/log" replace />} />
          <Route path="leads/suggestions" element={<LeadSuggestionsPage />} />
          <Route path="leads/log" element={<LeadsLogPage />} />
          <Route path="leads/pipeline" element={<PipelinePage />} />
          {/* Sales merged into Leads & sales: old addresses */}
          <Route path="sales" element={<Navigate to="/leads/pipeline" replace />} />
          <Route path="sales/suggestions" element={<Navigate to="/leads/suggestions" replace />} />
          <Route path="sales/pipeline" element={<Navigate to="/leads/pipeline" replace />} />
          <Route path="suggestions" element={<Navigate to="/suggestions/content" replace />} />
          <Route path="suggestions/:area" element={<SuggestionsPage />} />
          <Route path="linkedin" element={<LinkedInPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          {/* Old addresses */}
          <Route path="accounts" element={<Navigate to="/settings?tab=general" replace />} />
          <Route path="assistant" element={<Navigate to="/suggestions" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
