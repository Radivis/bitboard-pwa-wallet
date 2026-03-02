import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Container } from '@mui/material'
import Home from './pages/Home'
import Subscribed from './pages/Subscribed'
import Login from './pages/Login'
import InitialPassword from './pages/InitialPassword'
import AdminDashboard from './pages/AdminDashboard'
import AdminNewsletter from './pages/AdminNewsletter'
import AdminPassword from './pages/AdminPassword'
import Blog from './pages/Blog'
import BlogPost from './pages/BlogPost'
import AdminBlogList from './pages/AdminBlogList'
import AdminBlogEdit from './pages/AdminBlogEdit'
import UnsubscribeConfirm from './pages/UnsubscribeConfirm'
import { ApiDocs } from './pages/ApiDocs'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'
import { ROUTES } from './constants/routes'
import { ProtectedRoute } from './components/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path={ROUTES.subscribed} element={<Subscribed />} />
            <Route path="/login" element={<Login />} />
            <Route path="/initial-password" element={<InitialPassword />} />
            <Route path="/subscriptions/unsubscribe" element={<UnsubscribeConfirm />} />
            <Route path="/docs" element={<ApiDocs />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:id" element={<BlogPost />} />
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/newsletters"
              element={
                <ProtectedRoute>
                  <AdminNewsletter />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/password"
              element={
                <ProtectedRoute>
                  <AdminPassword />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.adminBlog}
              element={
                <ProtectedRoute>
                  <AdminBlogList />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.adminBlogNew}
              element={
                <ProtectedRoute>
                  <AdminBlogEdit />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.adminBlogEditPath}
              element={
                <ProtectedRoute>
                  <AdminBlogEdit />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Container>
      </Layout>
    </BrowserRouter>
  )
}

export default App
