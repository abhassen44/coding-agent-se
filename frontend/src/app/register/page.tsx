'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setStoredAuthTokens } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export default function RegisterPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        setIsLoading(true);

        try {
            const registerResponse = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name: name, email, password }),
            });

            if (registerResponse.ok) {
                const loginResponse = await fetch(`${API_BASE}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });

                if (loginResponse.ok) {
                    const data = await loginResponse.json();
                    setStoredAuthTokens({
                        accessToken: data.access_token,
                        refreshToken: data.refresh_token,
                    });
                    router.push('/chat');
                } else {
                    router.push('/login');
                }
            } else {
                const errorData = await registerResponse.json();
                setError(errorData.detail || 'Registration failed');
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0B0F0E] p-5">
            <div className="w-full max-w-md">
                {/* Card */}
                <div className="bg-[#111917] border border-[#1F2D28] rounded-2xl p-10 shadow-2xl">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#2EFF7B]/10 border border-[#2EFF7B]/30 flex items-center justify-center">
                            <svg className="w-8 h-8 text-[#2EFF7B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-[#E6F1EC] mb-2">Create Account</h1>
                        <p className="text-[#5A7268]">Join the Intelligent Coding Agent</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-center">
                                {error}
                            </div>
                        )}

                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-[#8FAEA2] mb-2">Name</label>
                            <input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your name"
                                required
                                className="w-full px-4 py-3 bg-[#1A2420] border border-[#1F2D28] rounded-xl text-[#E6F1EC] placeholder-[#5A7268] focus:border-[#2EFF7B] focus:outline-none transition-colors"
                            />
                        </div>

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-[#8FAEA2] mb-2">Email</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                className="w-full px-4 py-3 bg-[#1A2420] border border-[#1F2D28] rounded-xl text-[#E6F1EC] placeholder-[#5A7268] focus:border-[#2EFF7B] focus:outline-none transition-colors"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-[#8FAEA2] mb-2">Password</label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="w-full px-4 py-3 bg-[#1A2420] border border-[#1F2D28] rounded-xl text-[#E6F1EC] placeholder-[#5A7268] focus:border-[#2EFF7B] focus:outline-none transition-colors"
                            />
                        </div>

                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#8FAEA2] mb-2">Confirm Password</label>
                            <input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="w-full px-4 py-3 bg-[#1A2420] border border-[#1F2D28] rounded-xl text-[#E6F1EC] placeholder-[#5A7268] focus:border-[#2EFF7B] focus:outline-none transition-colors"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3.5 bg-[#2EFF7B] text-[#0B0F0E] font-semibold rounded-xl hover:bg-[#1ED760] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoading ? 'Creating account...' : 'Create Account'}
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="mt-6 pt-6 border-t border-[#1F2D28] text-center">
                        <p className="text-[#5A7268]">
                            Already have an account?{' '}
                            <Link href="/login" className="text-[#2EFF7B] hover:underline font-medium">
                                Sign in
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
