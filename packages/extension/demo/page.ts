/**
 * The page the demo operates on.
 *
 * It has to be real DOM, not a picture: the demo runs the product's own content
 * tools against it, so `extractPageFields` must find real fields and the
 * comment list must really be collapsed for the caution-tier click to produce a
 * visible change.
 */

export const EXPAND_BUTTON_ID = "demo-expand-comments";
export const COMMENTS_ID = "demo-comments";

const COMMENTS = [
  { author: "陈**", stars: "★★★★★", text: "腰托支撑到位，坐一天不酸。装了大概二十分钟。" },
  { author: "李**", stars: "★★★★☆", text: "扶手可调范围很大，唯一不足是椅脚有点重。" },
  { author: "w**8", stars: "★★★★★", text: "网面透气，夏天久坐后背不闷，比之前那把强太多。" }
];

export const MOCK_PAGE_HTML = `
<article class="demo-product">
  <div class="demo-crumbs">首页 / 办公家具 / 办公椅</div>

  <h1 class="demo-title">人体工学办公椅 Pro</h1>

  <div class="demo-price-row">
    <span class="demo-price">¥1,299</span>
    <span class="demo-price-was">¥1,899</span>
    <span class="demo-badge">限时</span>
  </div>

  <table class="demo-specs">
    <tbody>
      <tr><th>型号</th><td>ERGO-PRO-2026</td></tr>
      <tr><th>材质</th><td>高弹网布 + 铝合金脚</td></tr>
      <tr><th>承重</th><td>150 kg</td></tr>
      <tr><th>调节</th><td>座高 / 扶手 4D / 腰托 / 靠背 135°</td></tr>
    </tbody>
  </table>

  <div class="demo-actions">
    <button class="demo-buy" type="button">加入购物车</button>
    <button class="demo-fav" type="button">收藏</button>
  </div>

  <section class="demo-reviews">
    <h2>商品评价 <span class="demo-count">(1,284)</span></h2>
    <button id="${EXPAND_BUTTON_ID}" type="button">展开全部评论</button>
    <ul id="${COMMENTS_ID}" hidden>
      ${COMMENTS.map(
        (c) => `<li class="demo-comment">
          <span class="demo-comment-author">${c.author}</span>
          <span class="demo-comment-stars">${c.stars}</span>
          <p class="demo-comment-text">${c.text}</p>
        </li>`
      ).join("")}
    </ul>
  </section>
</article>`;

export function mountMockPage(root: HTMLElement): void {
  root.innerHTML = MOCK_PAGE_HTML;
  const button = root.querySelector<HTMLButtonElement>(`#${EXPAND_BUTTON_ID}`);
  const list = root.querySelector<HTMLElement>(`#${COMMENTS_ID}`);
  if (!button || !list) return;
  button.addEventListener("click", () => {
    list.hidden = false;
    button.textContent = "收起评论";
    button.setAttribute("aria-expanded", "true");
  });
}
