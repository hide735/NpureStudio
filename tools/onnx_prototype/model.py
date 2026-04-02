import torch
import torch.nn as nn

class ConvBlock(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.net(x)

class Down(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.pool = nn.MaxPool2d(2)
        self.conv = ConvBlock(in_ch, out_ch)

    def forward(self, x):
        return self.conv(self.pool(x))

class Up(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        # in_ch: channels of input to upconv, skip_ch will be provided at init time by caller through constructor usage
        # We'll store upconv to produce out_ch channels, and ConvBlock will accept (out_ch + skip_ch) as input.
        self.up = nn.ConvTranspose2d(in_ch, out_ch, 2, stride=2)
        # placeholder; actual conv initialization will be set by factory below when skip channels known
        self.conv = None

    def init_conv(self, skip_ch, out_ch):
        # initialize conv block with correct input channels = out_ch + skip_ch
        self.conv = ConvBlock(out_ch + skip_ch, out_ch)

    def forward(self, x, skip):
        x = self.up(x)
        # Ensure conv is initialized (should be done by model constructor)
        if self.conv is None:
            # fallback: infer sizes
            in_ch = x.shape[1] + skip.shape[1]
            out_ch = x.shape[1]
            self.conv = ConvBlock(in_ch, out_ch)
        x = torch.cat([x, skip], dim=1)
        return self.conv(x)

class SmallUNet(nn.Module):
    def __init__(self, in_channels=4, out_channels=3, base=32):
        super().__init__()
        self.enc1 = ConvBlock(in_channels, base)
        self.enc2 = Down(base, base*2)
        self.enc3 = Down(base*2, base*4)

        self.bottleneck = ConvBlock(base*4, base*8)

        # Up layers: (in_ch, skip_ch, out_ch) will be configured below
        self.up3 = Up(base*8, base*4)   # will concat with enc2 (base*2)
        self.up2 = Up(base*4, base)     # will concat with enc1 (base)

        # initialize conv blocks inside Up with known skip channel sizes
        self.up3.init_conv(skip_ch=base*2, out_ch=base*4)
        self.up2.init_conv(skip_ch=base, out_ch=base)

        self.final = nn.Conv2d(base, out_channels, 1)

    def forward(self, x):
        c1 = self.enc1(x)
        c2 = self.enc2(c1)
        c3 = self.enc3(c2)
        b = self.bottleneck(c3)
        # up3: upsample bottleneck and concat with c2
        u3 = self.up3(b, c2)
        # up2: upsample u3 and concat with c1
        u2 = self.up2(u3, c1)
        return torch.tanh(self.final(u2))

if __name__ == '__main__':
    m = SmallUNet()
    x = torch.randn(1,4,128,128)
    y = m(x)
    print('output', y.shape)
