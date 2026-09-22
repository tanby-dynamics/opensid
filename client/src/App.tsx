import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Dashboard from './pages/Dashboard';
import AccountDetail from './pages/AccountDetail';
import AllAccounts from './pages/AllAccounts';
import Search from './pages/Search';
import Settings from './pages/Settings';
import Footer from './components/Footer';

const queryClient = new QueryClient();

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <div className="min-h-screen flex flex-col">
                    <Routes>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/accounts" element={<AllAccounts />} />
                        <Route path="/accounts/:id" element={<AccountDetail />} />
                        <Route path="/search" element={<Search />} />
                        <Route path="/settings" element={<Settings />} />
                    </Routes>
                    <Footer />
                </div>
            </BrowserRouter>
            <Toaster
                position="bottom-center"
                offset={64}
                toastOptions={{
                    style: {
                        background: 'var(--teak-dark)',
                        color: 'var(--cream)',
                        borderRadius: '99px',
                        fontSize: '13px',
                        fontWeight: '600',
                        fontFamily: 'var(--font-body)',
                        border: 'none',
                        padding: '10px 20px',
                    },
                    classNames: { error: 'opensid-toast-error' },
                }}
            />
        </QueryClientProvider>
    );
}
