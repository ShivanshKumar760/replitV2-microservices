FROM nixos/nix

WORKDIR /workspace

# Enable Nix flakes
RUN mkdir -p /etc/nix && \
    echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf

# Install Node.js 18 + npm globally
RUN nix profile install "github:NixOS/nixpkgs/nixos-23.05#nodejs-18_x"
EXPOSE 3000

CMD ["sh", "-c", "if [ ! -d node_modules ]; then npm install; fi && node index.js"]