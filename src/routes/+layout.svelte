<script lang="ts">
	import BottomBar from '$lib/components/BottomBar.svelte';

	let { children, data } = $props();
</script>

<div class="content-wrapper">
	<div class="content">
		{@render children?.()}
	</div>
	<div class="footer">
		<BottomBar {data} />
	</div>
</div>
<style>
	.content-wrapper {
		position: absolute;
		display: flex;
		flex-direction: column;
		top: 0;
		bottom: 0;
		left: 0;
		right: 0;
	}

	.content {
		flex: 1;
		overflow-y: auto;
	}

	.footer {
		flex-shrink: 0;
	}

	@media print {
		.content-wrapper {
			position: static;
			height: auto;
			overflow: visible;
		}

		.content {
			overflow: visible !important;
		}

		.footer {
			display: none !important;
		}
	}
</style>