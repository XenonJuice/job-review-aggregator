const form = document.querySelector('#collect-form');
const companyInput = document.querySelector('#company-query');
const maxPagesInput = document.querySelector('#max-pages');
const submitButton = document.querySelector('#submit-button');
const status = document.querySelector('#status');

restoreForm();

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const companyQuery = companyInput.value.trim();
  const maxPages = Number(maxPagesInput.value);

  setBusy(true);
  setStatus('正在读取当前账号可见的评论，请不要关闭这个窗口。', 'working');

  await chrome.storage.local.set({ companyQuery, maxPages });

  chrome.runtime.sendMessage(
    {
      type: 'collect-tenshoku-kaigi',
      payload: { companyQuery, maxPages },
    },
    (response) => {
      setBusy(false);

      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message, 'error');
        return;
      }
      if (!response?.ok) {
        setStatus(response?.error ?? '导入失败。', 'error');
        return;
      }

      setStatus(
        `完成：${response.result.company}，已导入 ${response.result.reviewCount} 条评论。`,
        'success',
      );
    },
  );
});

async function restoreForm() {
  const saved = await chrome.storage.local.get(['companyQuery', 'maxPages']);

  if (saved.companyQuery) {
    companyInput.value = saved.companyQuery;
  }
  if (saved.maxPages) {
    maxPagesInput.value = saved.maxPages;
  }
}

function setBusy(busy) {
  submitButton.disabled = busy;
  submitButton.textContent = busy ? '正在导入...' : '读取并导入';
}

function setStatus(message, state) {
  status.textContent = message;
  status.dataset.state = state;
}
