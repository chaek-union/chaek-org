<script lang="ts">
	import BottomBar from '$lib/components/BottomBar.svelte';

	let { children, data } = $props();
</script>

{@render children?.()}

<BottomBar {data} />
