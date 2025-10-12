<script lang="ts">
	import { t } from '$lib/i18n';
	import { signIn, signOut } from '@auth/sveltekit/client';

	let { data } = $props();

	const session = $derived(data?.session);
	const user = $derived(session?.user);
	const isChaekMember = $derived((user as any)?.isChaekMember);
</script>

<div class="bottom-bar">
	<div class="container">
		<p class="footer-text">
			{$t('footer.prefix')}
			<a href="https://github.com/chaek-union" target="_blank" rel="noopener noreferrer">
				{$t('footer.link')}
			</a>
			{$t('footer.suffix')}
		</p>
		{#if isChaekMember}
			<button class="admin-login-btn" onclick={() => signOut()}>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
					/>
				</svg>
				<span>{$t('auth.signOut')}</span>
			</button>
		{:else}
			<button class="admin-login-btn" onclick={() => signIn('github')}>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
					/>
				</svg>
				<span>{$t('auth.admin')}</span>
			</button>
		{/if}
	</div>
</div>

<style>
	.bottom-bar {
		background: #f5f5f5;
		border-top: 1px solid #e0e0e0;
		padding: 0.75rem 0;
		box-shadow: 0 -1px 4px rgba(0, 0, 0, 0.05);
		z-index: 999;
	}

	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.footer-text {
		margin: 0;
		color: #666;
		font-size: 0.85rem;
		flex: 1;
		text-align: center;
	}

	.footer-text a {
		color: #4285f4;
		text-decoration: none;
		transition: all 0.2s;
	}

	.footer-text a:hover {
		text-decoration: underline;
		color: #3367d6;
	}

	.admin-login-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: transparent;
		border: 1px solid #d0d0d0;
		color: #666;
		cursor: pointer;
		padding: 0.4rem 0.75rem;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 500;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.admin-login-btn:hover {
		background: #e8e8e8;
		border-color: #b0b0b0;
		color: #333;
	}

	.admin-login-btn svg {
		flex-shrink: 0;
		opacity: 0.7;
	}

	@media (max-width: 1024px) {
		.container {
			padding: 0 1rem;
		}

		.footer-text {
			font-size: 0.75rem;
		}

		.admin-login-btn {
			padding: 0.35rem 0.6rem;
			font-size: 0.7rem;
		}

		.admin-login-btn svg {
			width: 12px;
			height: 12px;
		}
	}
</style>
