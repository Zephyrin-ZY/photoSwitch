import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { PhotoStoreProvider } from './stores/PhotoStore'
import { ShortcutProvider } from './stores/ShortcutStore'
import Layout from './components/Layout'
import Home from './pages/Home'
import ProjectPage from './pages/ProjectPage'
import FilterPage from './pages/FilterPage'
import TestPage from './pages/TestPage'

export default function App() {
  return (
    <PhotoStoreProvider>
      <ShortcutProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/project/:id" element={<ProjectPage />} />
              <Route path="/project/:id/filter" element={<FilterPage />} />
              <Route path="/test" element={<TestPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ShortcutProvider>
    </PhotoStoreProvider>
  )
}
