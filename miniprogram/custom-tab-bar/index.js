Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/company/company', text: '首页', icon: '/assets/icons/home-inactive.svg.png', activeIcon: '/assets/icons/home-active.svg.png' },
      { pagePath: '/pages/records/records', text: '办理记录', icon: '/assets/icons/record-inactive.svg.png', activeIcon: '/assets/icons/record-active.svg.png' },
      { pagePath: '/pages/contact/contact', text: '联系客服', icon: '/assets/icons/contact-inactive.svg.png', activeIcon: '/assets/icons/contact-active.svg.png' }
    ]
  },
  methods: {
    switchTab(event) {
      const index = event.currentTarget.dataset.index;
      const item = this.data.list[index];
      if (!item || index === this.data.selected) return;
      wx.switchTab({ url: item.pagePath });
    }
  }
});
