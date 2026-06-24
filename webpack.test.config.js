module.exports = {
	// mode: 'development',
	module: {
		rules: [
			{
				test: /\.(js|jsx|ts|tsx)$/,
				exclude: /node_modules/,
				loader: 'babel-loader',
				options: {
					presets: [
						[
							'es2015',
							{ modules: false },
							'@babel/preset-env',
							'@babel/preset-react',
							'@babel/preset-typescript',
						],
						'react',
						'stage-2',
					],
				},
			},
		],
	},
};
