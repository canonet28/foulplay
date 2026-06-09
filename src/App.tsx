/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import BookedBoxDashboard from './components/BookedBoxDashboard';
import Dashboard from './components/Dashboard';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/match/:matchId" element={<BookedBoxDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
