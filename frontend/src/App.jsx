import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import PublicSite from './pages/PublicSite'
import AdminLayout from './pages/AdminLayout'
import AdminLogin from './pages/AdminLogin'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicSite />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/*" element={<AdminLayout />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>

    //Hello sameer bro

  )
}
