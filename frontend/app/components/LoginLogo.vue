<!--
  Passmed wordmark used in the login / forgot-password modal headers.
  Thin wrapper over the shared <BrandWordmark> with the modal's color scheme
  (light accent + dark lettering) so there's a single source for the SVG.
-->
<template>
  <div class="login-logo">
    <BrandWordmark :width="140" :height="29" accent="#44CEFF" fill="#3B394E" />
  </div>
</template>
